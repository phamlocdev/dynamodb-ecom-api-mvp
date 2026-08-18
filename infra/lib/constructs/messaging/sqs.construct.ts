import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import { orderProcessingDlqName, orderProcessingQueueName } from '../../config/constants'

export interface SqsConstructProps {
  /** Order Processor Lambda — được attach Event Source Mapping */
  orderProcessorLambda: nodejs.NodejsFunction
}

export class SqsConstruct extends Construct {
  readonly orderProcessingQueue: sqs.Queue
  readonly orderProcessingDlq: sqs.Queue

  constructor(scope: Construct, id: string, props: SqsConstructProps) {
    super(scope, id)

    // --- Dead Letter Queue ---
    // Messages bị thất bại sau maxReceiveCount=3 lần sẽ được move vào đây
    // Dùng để observe (inspect) các order không xử lý được
    this.orderProcessingDlq = new sqs.Queue(this, 'OrderProcessingDlq', {
      queueName: orderProcessingDlqName,
      // Giữ message 14 ngày để có thời gian debug
      retentionPeriod: cdk.Duration.days(14),
      // visibilityTimeout của DLQ phải >= timeout của Lambda consumer (25s)
      visibilityTimeout: cdk.Duration.seconds(60),
    })

    // --- Main Queue ---
    // Producer (API Lambda) gửi order message vào đây
    // Consumer (Order Processor Lambda) được trigger tự động qua Event Source Mapping
    this.orderProcessingQueue = new sqs.Queue(this, 'OrderProcessingQueue', {
      queueName: orderProcessingQueueName,
      // visibilityTimeout: khoảng thời gian message bị "ẩn" sau khi SQS deliver nó cho consumer.
      // Phải >= Lambda timeout (25s). Nếu Lambda chưa xử lý xong trong 30s → SQS re-deliver.
      // Đây cũng là "window" để cancel order: nếu processor chưa pick up, message vẫn visible
      // và order status vẫn là PENDING → có thể cancel ở tầng application.
      visibilityTimeout: cdk.Duration.seconds(30),
      // Retention: giữ message 4 ngày nếu không có consumer nào pick up
      retentionPeriod: cdk.Duration.days(4),
      // Redrive policy: sau 3 lần receive không delete → move sang DLQ
      deadLetterQueue: {
        queue: this.orderProcessingDlq,
        maxReceiveCount: 3,
      },
    })

    // Grant Order Processor Lambda quyền đọc và xóa message khỏi queue
    this.orderProcessingQueue.grantConsumeMessages(props.orderProcessorLambda)

    // Event Source Mapping: SQS tự động trigger Order Processor Lambda
    // batchSize=1 → mỗi Lambda invocation xử lý đúng 1 order message
    // Giúp dễ debug khi học; có thể tăng sau để học batching
    props.orderProcessorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(this.orderProcessingQueue, {
        batchSize: 1,
        // reportBatchItemFailures: cho phép partial batch failure (học sau)
      }),
    )
  }
}
