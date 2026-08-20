import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import { Construct } from 'constructs'
import {
  cartItemsTableName,
  cartsTableName,
  inventoryTableName,
  orderItemsTableName,
  ordersTableName,
  processPaymentQueueName,
  productsTableName,
  releaseReservationQueueName,
} from '../../config/constants'
import { createNodejsBundling, removeGeneratedSourceArtifacts } from '../../shared/lambda-bundling'

export interface OrdersWorkersConstructProps {
  productsTable: dynamodb.ITable
  cartsTable: dynamodb.ITable
  cartItemsTable: dynamodb.ITable
  ordersTable: dynamodb.ITable
  orderItemsTable: dynamodb.ITable
  inventoryTable: dynamodb.ITable
  placeOrderQueue: sqs.IQueue
  processPaymentQueue: sqs.IQueue
  releaseReservationQueue: sqs.IQueue
  userPoolId: string
  userPoolClientId: string
}

export class OrdersWorkersConstruct extends Construct {
  readonly placeOrderWorker: nodejs.NodejsFunction
  readonly processPaymentWorker: nodejs.NodejsFunction
  readonly releaseReservationWorker: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: OrdersWorkersConstructProps) {
    super(scope, id)

    const sharedEnvironment = {
      PRODUCTS_TABLE: productsTableName,
      CARTS_TABLE: cartsTableName,
      CART_ITEMS_TABLE: cartItemsTableName,
      ORDERS_TABLE: ordersTableName,
      ORDER_ITEMS_TABLE: orderItemsTableName,
      INVENTORY_TABLE: inventoryTableName,
      DYNAMODB_ENDPOINT: 'http://host.docker.internal:4566',
      COGNITO_IDP_ENDPOINT: 'http://host.docker.internal:4566',
      COGNITO_USER_POOL_ID: props.userPoolId,
      COGNITO_CLIENT_ID: props.userPoolClientId,
      PROCESS_PAYMENT_QUEUE_URL: props.processPaymentQueue.queueUrl,
      PROCESS_PAYMENT_QUEUE_NAME: processPaymentQueueName,
      RELEASE_RESERVATION_QUEUE_URL: props.releaseReservationQueue.queueUrl,
      RELEASE_RESERVATION_QUEUE_NAME: releaseReservationQueueName,
    }

    this.placeOrderWorker = new nodejs.NodejsFunction(this, 'PlaceOrderWorker', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '..', '..', '..', '..', 'src', 'order-worker.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
      environment: sharedEnvironment,
    })

    this.releaseReservationWorker = new nodejs.NodejsFunction(this, 'ReleaseReservationWorker', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '..', '..', '..', '..', 'src', 'order-release-worker.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
      environment: sharedEnvironment,
    })

    this.processPaymentWorker = new nodejs.NodejsFunction(this, 'ProcessPaymentWorker', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '..', '..', '..', '..', 'src', 'payment-worker.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
      environment: {
        ...sharedEnvironment,
        MOCK_PAYMENT_DELAY_MS: '5000',
      },
    })

    this.placeOrderWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(props.placeOrderQueue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    )

    this.releaseReservationWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(props.releaseReservationQueue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    )

    this.processPaymentWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(props.processPaymentQueue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    )

    const workerFunctions = [
      this.placeOrderWorker,
      this.processPaymentWorker,
      this.releaseReservationWorker,
    ]
    const tables = [
      props.productsTable,
      props.cartsTable,
      props.cartItemsTable,
      props.ordersTable,
      props.orderItemsTable,
      props.inventoryTable,
    ]

    tables.forEach((table) => {
      workerFunctions.forEach((worker) => table.grantReadWriteData(worker))
    })

    props.placeOrderQueue.grantConsumeMessages(this.placeOrderWorker)
    props.processPaymentQueue.grantConsumeMessages(this.processPaymentWorker)
    props.releaseReservationQueue.grantConsumeMessages(this.releaseReservationWorker)
    props.processPaymentQueue.grantSendMessages(this.processPaymentWorker)
    props.releaseReservationQueue.grantSendMessages(this.placeOrderWorker)
    props.releaseReservationQueue.grantSendMessages(this.processPaymentWorker)
  }
}
