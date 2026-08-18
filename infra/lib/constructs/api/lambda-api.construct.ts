import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import {
  cartsTableName,
  categoriesTableName,
  inventoryTableName,
  orderItemsTableName,
  ordersTableName,
  productsTableName,
} from '../../config/constants'
import { createNodejsBundling, removeGeneratedSourceArtifacts } from '../../shared/lambda-bundling'

export interface LambdaApiConstructProps {
  productsTable: dynamodb.ITable
  categoriesTable: dynamodb.ITable
  cartsTable: dynamodb.ITable
  inventoryTable: dynamodb.ITable
  ordersTable: dynamodb.ITable
  orderItemsTable: dynamodb.ITable
  userPoolId: string
  userPoolClientId: string
  /** URL của SQS order-processing-queue — được pass vào Lambda env */
  orderProcessingQueueUrl: string
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
        // Existing tables
        PRODUCTS_TABLE: productsTableName,
        CATEGORIES_TABLE: categoriesTableName,
        // New tables
        CARTS_TABLE: cartsTableName,
        INVENTORY_TABLE: inventoryTableName,
        ORDERS_TABLE: ordersTableName,
        ORDER_ITEMS_TABLE: orderItemsTableName,
        // Endpoints
        DYNAMODB_ENDPOINT: 'http://host.docker.internal:4566',
        COGNITO_IDP_ENDPOINT: 'http://host.docker.internal:4566',
        // Cognito
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
        // SQS
        ORDER_PROCESSING_QUEUE_URL: props.orderProcessingQueueUrl,
        SQS_ENDPOINT: 'http://host.docker.internal:4566',
      },
    })

    // Existing table grants
    props.productsTable.grantReadWriteData(this.apiHandler)
    props.categoriesTable.grantReadWriteData(this.apiHandler)
    // New table grants
    props.cartsTable.grantReadWriteData(this.apiHandler)
    props.inventoryTable.grantReadWriteData(this.apiHandler)
    props.ordersTable.grantReadWriteData(this.apiHandler)
    props.orderItemsTable.grantReadWriteData(this.apiHandler)
  }
}
