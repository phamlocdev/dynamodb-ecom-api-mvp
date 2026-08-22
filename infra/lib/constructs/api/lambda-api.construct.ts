import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import { Construct } from 'constructs'
import { getLocalStackInfraEnv } from '../../config/env'
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
  releaseReservationQueue: sqs.IQueue
  userPoolId: string
  userPoolClientId: string
}

export class LambdaApiConstruct extends Construct {
  readonly apiHandler: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: LambdaApiConstructProps) {
    super(scope, id)
    const infraEnv = getLocalStackInfraEnv()

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
        PRODUCTS_TABLE: infraEnv.productsTableName,
        CATEGORIES_TABLE: infraEnv.categoriesTableName,
        CARTS_TABLE: infraEnv.cartsTableName,
        CART_ITEMS_TABLE: infraEnv.cartItemsTableName,
        ORDERS_TABLE: infraEnv.ordersTableName,
        ORDER_ITEMS_TABLE: infraEnv.orderItemsTableName,
        INVENTORY_TABLE: infraEnv.inventoryTableName,
        DYNAMODB_ENDPOINT: infraEnv.dynamoDbLambdaEndpoint,
        COGNITO_IDP_ENDPOINT: infraEnv.cognitoIdpLambdaEndpoint,
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
        PLACE_ORDER_QUEUE_URL: props.placeOrderQueue.queueUrl,
        PLACE_ORDER_QUEUE_NAME: infraEnv.placeOrderQueueName,
        RELEASE_RESERVATION_QUEUE_URL: props.releaseReservationQueue.queueUrl,
        RELEASE_RESERVATION_QUEUE_NAME: infraEnv.releaseReservationQueueName,
        PAYMENT_CONFIRMATION_SECONDS_TIMEOUT: infraEnv.paymentConfirmationTimeoutSeconds,
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
    props.releaseReservationQueue.grantSendMessages(this.apiHandler)
  }
}
