import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import { Construct } from 'constructs'
import {
  cartItemsTableName,
  cartsTableName,
  categoriesTableName,
  inventoryTableName,
  orderItemsTableName,
  ordersTableName,
  placeOrderQueueName,
  processPaymentQueueName,
  productsTableName,
  releaseReservationQueueName,
} from '../../config/constants'
import { createNodejsBundling, removeGeneratedSourceArtifacts } from '../../shared/lambda-bundling'

export interface LambdaApiConstructProps {
  productsTable: dynamodb.ITable
  categoriesTable: dynamodb.ITable
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

export class LambdaApiConstruct extends Construct {
  readonly apiHandler: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: LambdaApiConstructProps) {
    super(scope, id)

    this.apiHandler = new nodejs.NodejsFunction(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '..', '..', '..', '..', 'src', 'lambda.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
      environment: {
        PRODUCTS_TABLE: productsTableName,
        CATEGORIES_TABLE: categoriesTableName,
        CARTS_TABLE: cartsTableName,
        CART_ITEMS_TABLE: cartItemsTableName,
        ORDERS_TABLE: ordersTableName,
        ORDER_ITEMS_TABLE: orderItemsTableName,
        INVENTORY_TABLE: inventoryTableName,
        DYNAMODB_ENDPOINT: 'http://host.docker.internal:4566',
        COGNITO_IDP_ENDPOINT: 'http://host.docker.internal:4566',
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
        PLACE_ORDER_QUEUE_URL: props.placeOrderQueue.queueUrl,
        PLACE_ORDER_QUEUE_NAME: placeOrderQueueName,
        PROCESS_PAYMENT_QUEUE_URL: props.processPaymentQueue.queueUrl,
        PROCESS_PAYMENT_QUEUE_NAME: processPaymentQueueName,
        RELEASE_RESERVATION_QUEUE_URL: props.releaseReservationQueue.queueUrl,
        RELEASE_RESERVATION_QUEUE_NAME: releaseReservationQueueName,
      },
    })

    props.productsTable.grantReadWriteData(this.apiHandler)
    props.categoriesTable.grantReadWriteData(this.apiHandler)
    props.cartsTable.grantReadWriteData(this.apiHandler)
    props.cartItemsTable.grantReadWriteData(this.apiHandler)
    props.ordersTable.grantReadWriteData(this.apiHandler)
    props.orderItemsTable.grantReadWriteData(this.apiHandler)
    props.inventoryTable.grantReadWriteData(this.apiHandler)
    props.placeOrderQueue.grantSendMessages(this.apiHandler)
    props.processPaymentQueue.grantSendMessages(this.apiHandler)
    props.releaseReservationQueue.grantSendMessages(this.apiHandler)
  }
}
