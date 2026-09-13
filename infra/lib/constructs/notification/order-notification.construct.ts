import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as events from 'aws-cdk-lib/aws-events'
import * as eventTargets from 'aws-cdk-lib/aws-events-targets'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import { getAwsInfraEnv } from '../../config/env'
import {
  copyDirectoryIntoBundle,
  createNodejsBundling,
  removeGeneratedSourceArtifacts,
  sourceEntryPath,
} from '../../shared/lambda-bundling'

export interface OrderNotificationConstructProps {
  eventBus: events.IEventBus
  ordersTable: dynamodb.ITable
  orderItemsTable: dynamodb.ITable
  emailTrackingTable: dynamodb.ITable
}

export class OrderNotificationConstruct extends Construct {
  readonly orderNotificationWorker: nodejs.NodejsFunction
  readonly analyticsDemoWorker: nodejs.NodejsFunction
  readonly fulfillmentDemoWorker: nodejs.NodejsFunction
  readonly cancellationInventoryDemoWorker: nodejs.NodejsFunction
  readonly cancellationAccountingDemoWorker: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: OrderNotificationConstructProps) {
    super(scope, id)
    const infraEnv = getAwsInfraEnv()

    this.orderNotificationWorker = new nodejs.NodejsFunction(this, 'Worker', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: sourceEntryPath('order-notification-worker.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: createNodejsBundling({
        afterBundling: (inputDir, outputDir) => [
          ...removeGeneratedSourceArtifacts(),
          ...copyDirectoryIntoBundle(inputDir, outputDir, 'src/mail/templates', 'templates'),
        ],
      }),
      environment: {
        ORDERS_TABLE: props.ordersTable.tableName,
        ORDER_ITEMS_TABLE: props.orderItemsTable.tableName,
        EMAIL_TRACKING_TABLE: props.emailTrackingTable.tableName,
        SES_ENABLED: String(infraEnv.sesEnabled),
        SES_FROM_EMAIL: infraEnv.sesFromEmail ?? '',
        SES_VERIFIED_RECIPIENTS: infraEnv.sesVerifiedRecipients.join(','),
        SES_CONFIGURATION_SET_NAME: infraEnv.sesConfigurationSetName ?? '',
      },
    })

    this.analyticsDemoWorker = new nodejs.NodejsFunction(this, 'AnalyticsDemoWorker', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: sourceEntryPath('order-shipped-analytics-demo-worker.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
    })

    this.fulfillmentDemoWorker = new nodejs.NodejsFunction(this, 'FulfillmentDemoWorker', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: sourceEntryPath('order-shipped-fulfillment-demo-worker.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
    })

    this.cancellationInventoryDemoWorker = new nodejs.NodejsFunction(
      this,
      'CancellationInventoryDemoWorker',
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        entry: sourceEntryPath('order-cancelled-inventory-demo-worker.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
        bundling: createNodejsBundling({
          afterBundling: () => removeGeneratedSourceArtifacts(),
        }),
      },
    )

    this.cancellationAccountingDemoWorker = new nodejs.NodejsFunction(
      this,
      'CancellationAccountingDemoWorker',
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        entry: sourceEntryPath('order-cancelled-accounting-demo-worker.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
        bundling: createNodejsBundling({
          afterBundling: () => removeGeneratedSourceArtifacts(),
        }),
      },
    )

    props.ordersTable.grantReadData(this.orderNotificationWorker)
    props.orderItemsTable.grantReadData(this.orderNotificationWorker)
    props.emailTrackingTable.grantReadWriteData(this.orderNotificationWorker)

    new events.Rule(this, 'OrderShippedRule', {
      eventBus: props.eventBus,
      eventPattern: {
        source: ['ecommerce.orders'],
        detailType: ['OrderShipped'],
      },
      targets: [
        new eventTargets.LambdaFunction(this.orderNotificationWorker),
        new eventTargets.LambdaFunction(this.analyticsDemoWorker),
        new eventTargets.LambdaFunction(this.fulfillmentDemoWorker),
      ],
    })

    const orderCancelledEventPattern: events.EventPattern = {
      source: ['ecommerce.orders'],
      detailType: ['OrderCancelled'],
    }

    new events.Rule(this, 'OrderCancelledInventoryRule', {
      eventBus: props.eventBus,
      eventPattern: orderCancelledEventPattern,
      targets: [new eventTargets.LambdaFunction(this.cancellationInventoryDemoWorker)],
    })

    new events.Rule(this, 'OrderCancelledAccountingRule', {
      eventBus: props.eventBus,
      eventPattern: {
        ...orderCancelledEventPattern,
        detail: {
          totalAmount: [{ numeric: ['>=', 10000000] }],
        },
      },
      targets: [new eventTargets.LambdaFunction(this.cancellationAccountingDemoWorker)],
    })

    new events.Rule(this, 'OrderCancelledNotificationRule', {
      eventBus: props.eventBus,
      eventPattern: orderCancelledEventPattern,
      targets: [new eventTargets.LambdaFunction(this.orderNotificationWorker)],
    })
  }
}
