import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import { inventoryTableName, orderItemsTableName, ordersTableName } from '../../config/constants'
import { createNodejsBundling, removeGeneratedSourceArtifacts } from '../../shared/lambda-bundling'

export interface OrderProcessorConstructProps {
  ordersTable: dynamodb.ITable
  orderItemsTable: dynamodb.ITable
  inventoryTable: dynamodb.ITable
}

export class OrderProcessorConstruct extends Construct {
  readonly handler: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: OrderProcessorConstructProps) {
    super(scope, id)

    this.handler = new nodejs.NodejsFunction(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      // Entry point: plain TypeScript Lambda handler — không dùng NestJS
      entry: path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'lambdas',
        'order-processor',
        'index.ts',
      ),
      handler: 'handler',
      // Timeout phải < visibilityTimeout của SQS queue (30s)
      // để SQS biết Lambda đang xử lý và không re-deliver message
      timeout: cdk.Duration.seconds(25),
      memorySize: 256,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
      environment: {
        ORDERS_TABLE: ordersTableName,
        ORDER_ITEMS_TABLE: orderItemsTableName,
        INVENTORY_TABLE: inventoryTableName,
        DYNAMODB_ENDPOINT: 'http://host.docker.internal:4566',
        AWS_ACCOUNT_ID: '000000000000',
      },
    })

    // Grant DynamoDB permissions cho Order Processor Lambda
    props.ordersTable.grantReadWriteData(this.handler)
    props.orderItemsTable.grantReadWriteData(this.handler)
    props.inventoryTable.grantReadWriteData(this.handler)
  }
}
