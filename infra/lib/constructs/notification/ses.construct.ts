import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as ses from 'aws-cdk-lib/aws-ses'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import { Construct } from 'constructs'
import { getAwsInfraEnv } from '../../config/env'
import { createNodejsBundling, sourceEntryPath } from '../../shared/lambda-bundling'

export interface SesConstructProps {
  emailTrackingTable: dynamodb.ITable
}

export class SesConstruct extends Construct {
  readonly configurationSetName: string
  readonly eventTopic: sns.Topic
  readonly eventProcessor: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: SesConstructProps) {
    super(scope, id)

    const infraEnv = getAwsInfraEnv()
    this.configurationSetName = infraEnv.sesConfigurationSetName

    const configurationSet = new ses.CfnConfigurationSet(this, 'ConfigurationSet', {
      name: this.configurationSetName,
    })

    this.eventTopic = new sns.Topic(this, 'SesEventsTopic')
    this.eventProcessor = new nodejs.NodejsFunction(this, 'SesEventProcessor', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: sourceEntryPath('ses-event-processor.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: createNodejsBundling(),
      environment: {
        EMAIL_TRACKING_TABLE: props.emailTrackingTable.tableName,
      },
    })

    props.emailTrackingTable.grantReadWriteData(this.eventProcessor)
    this.eventTopic.addSubscription(new subscriptions.LambdaSubscription(this.eventProcessor))
    const topicPolicy = this.eventTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.eventTopic.topicArn],
        conditions: {
          StringEquals: {
            'AWS:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    )

    const eventDestination = new ses.CfnConfigurationSetEventDestination(this, 'ConfigurationSetEventDestination', {
      configurationSetName: this.configurationSetName,
      eventDestination: {
        enabled: true,
        matchingEventTypes: [
          'SEND',
          'DELIVERY',
          'BOUNCE',
          'COMPLAINT',
          'REJECT',
          'RENDERING_FAILURE',
        ],
        snsDestination: {
          topicArn: this.eventTopic.topicArn,
        },
      },
    })
    eventDestination.addResourceDependency(configurationSet)
    if (topicPolicy.policyDependable) {
      eventDestination.node.addDependency(topicPolicy.policyDependable)
    }
  }

  grantSendEmail(grantee: iam.IGrantable) {
    return iam.Grant.addToPrincipal({
      grantee,
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resourceArns: ['*'],
    })
  }
}
