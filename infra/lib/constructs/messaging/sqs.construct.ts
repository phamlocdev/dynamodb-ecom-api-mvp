import * as cdk from 'aws-cdk-lib'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import { Construct } from 'constructs'
import {
  placeOrderDlqName,
  placeOrderQueueName,
  processPaymentDlqName,
  processPaymentQueueName,
  releaseReservationDlqName,
  releaseReservationQueueName,
} from '../../config/constants'

export interface SqsConstructProps {
  visibilityTimeout?: cdk.Duration
}

export class SqsConstruct extends Construct {
  readonly placeOrderDlq: sqs.Queue
  readonly placeOrderQueue: sqs.Queue
  readonly processPaymentDlq: sqs.Queue
  readonly processPaymentQueue: sqs.Queue
  readonly releaseReservationDlq: sqs.Queue
  readonly releaseReservationQueue: sqs.Queue

  constructor(scope: Construct, id: string, props: SqsConstructProps = {}) {
    super(scope, id)

    const visibilityTimeout = props.visibilityTimeout ?? cdk.Duration.seconds(60)

    this.placeOrderDlq = new sqs.Queue(this, 'PlaceOrderDlq', {
      queueName: placeOrderDlqName,
      fifo: true,
      contentBasedDeduplication: false,
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout,
    })

    this.placeOrderQueue = new sqs.Queue(this, 'PlaceOrderQueue', {
      queueName: placeOrderQueueName,
      fifo: true,
      contentBasedDeduplication: false,
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      visibilityTimeout,
      deadLetterQueue: {
        queue: this.placeOrderDlq,
        maxReceiveCount: 3,
      },
    })

    this.processPaymentDlq = new sqs.Queue(this, 'ProcessPaymentDlq', {
      queueName: processPaymentDlqName,
      fifo: true,
      contentBasedDeduplication: false,
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout,
    })

    this.processPaymentQueue = new sqs.Queue(this, 'ProcessPaymentQueue', {
      queueName: processPaymentQueueName,
      fifo: true,
      contentBasedDeduplication: false,
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      visibilityTimeout,
      deadLetterQueue: {
        queue: this.processPaymentDlq,
        maxReceiveCount: 3,
      },
    })

    this.releaseReservationDlq = new sqs.Queue(this, 'ReleaseReservationDlq', {
      queueName: releaseReservationDlqName,
      fifo: true,
      contentBasedDeduplication: false,
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout,
    })

    this.releaseReservationQueue = new sqs.Queue(this, 'ReleaseReservationQueue', {
      queueName: releaseReservationQueueName,
      fifo: true,
      contentBasedDeduplication: false,
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      visibilityTimeout,
      deadLetterQueue: {
        queue: this.releaseReservationDlq,
        maxReceiveCount: 3,
      },
    })
  }
}
