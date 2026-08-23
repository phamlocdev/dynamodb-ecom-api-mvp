import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as events from 'aws-cdk-lib/aws-events'
import * as eventTargets from 'aws-cdk-lib/aws-events-targets'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import { Construct } from 'constructs'
import { getLocalStackInfraEnv } from '../../config/env'
import { createNodejsBundling, removeGeneratedSourceArtifacts } from '../../shared/lambda-bundling'

export interface OrdersWorkersConstructProps {
  productsTable: dynamodb.ITable
  cartsTable: dynamodb.ITable
  cartItemsTable: dynamodb.ITable
  ordersTable: dynamodb.ITable
  orderItemsTable: dynamodb.ITable
  inventoryTable: dynamodb.ITable
  placeOrderQueue: sqs.IQueue
  releaseReservationQueue: sqs.IQueue
  userPoolId: string
  userPoolClientId: string
}

export class OrdersWorkersConstruct extends Construct {
  readonly placeOrderWorker: nodejs.NodejsFunction
  readonly releaseReservationWorker: nodejs.NodejsFunction
  readonly reservationExpiryPoller: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: OrdersWorkersConstructProps) {
    super(scope, id)
    const infraEnv = getLocalStackInfraEnv()

    const sharedEnvironment = {
      PRODUCTS_TABLE: infraEnv.productsTableName,
      CARTS_TABLE: infraEnv.cartsTableName,
      CART_ITEMS_TABLE: infraEnv.cartItemsTableName,
      ORDERS_TABLE: infraEnv.ordersTableName,
      ORDER_ITEMS_TABLE: infraEnv.orderItemsTableName,
      INVENTORY_TABLE: infraEnv.inventoryTableName,
      DYNAMODB_ENDPOINT: infraEnv.dynamoDbLambdaEndpoint,
      COGNITO_IDP_ENDPOINT: infraEnv.cognitoIdpLambdaEndpoint,
      COGNITO_USER_POOL_ID: props.userPoolId,
      COGNITO_CLIENT_ID: props.userPoolClientId,
      RELEASE_RESERVATION_QUEUE_URL: props.releaseReservationQueue.queueUrl,
      RELEASE_RESERVATION_QUEUE_NAME: infraEnv.releaseReservationQueueName,
      PAYMENT_CONFIRMATION_SECONDS_TIMEOUT: infraEnv.paymentConfirmationTimeoutSeconds,
      // PLACE_ORDER_DELAY_MS: '10000',
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

    this.reservationExpiryPoller = new nodejs.NodejsFunction(this, 'ReservationExpiryPoller', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '..', '..', '..', '..', 'src', 'order-expiry-poller.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
      environment: sharedEnvironment,
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

    new events.Rule(this, 'ReservationExpiryPollerSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new eventTargets.LambdaFunction(this.reservationExpiryPoller)],
    })

    const workerFunctions = [
      this.placeOrderWorker,
      this.releaseReservationWorker,
      this.reservationExpiryPoller,
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
    props.releaseReservationQueue.grantConsumeMessages(this.releaseReservationWorker)
    props.releaseReservationQueue.grantSendMessages(this.placeOrderWorker)
    props.releaseReservationQueue.grantSendMessages(this.reservationExpiryPoller)
  }
}
