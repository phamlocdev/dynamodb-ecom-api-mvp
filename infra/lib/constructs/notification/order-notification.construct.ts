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
  readonly worker: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: OrderNotificationConstructProps) {
    super(scope, id)
    const infraEnv = getAwsInfraEnv()

    this.worker = new nodejs.NodejsFunction(this, 'Worker', {
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

    props.ordersTable.grantReadData(this.worker)
    props.orderItemsTable.grantReadData(this.worker)
    props.emailTrackingTable.grantReadWriteData(this.worker)

    new events.Rule(this, 'OrderShippedRule', {
      eventBus: props.eventBus,
      eventPattern: {
        source: ['ecommerce.orders'],
        detailType: ['OrderShipped'],
      },
      targets: [new eventTargets.LambdaFunction(this.worker)],
    })
  }
}
