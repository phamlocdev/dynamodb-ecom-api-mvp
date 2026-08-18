import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { CognitoConstruct } from '../constructs/auth/cognito.construct'
import { HttpApiConstruct } from '../constructs/api/http-api.construct'
import { LambdaApiConstruct } from '../constructs/api/lambda-api.construct'
import { OrderProcessorConstruct } from '../constructs/api/order-processor.construct'
import { DynamoDbConstruct } from '../constructs/data/dynamodb.construct'
import { SqsConstruct } from '../constructs/messaging/sqs.construct'
import { SesConstruct } from '../constructs/notification/ses.construct'
import { S3Construct } from '../constructs/storage/s3.construct'
import { getLocalStackInfraEnv } from '../config/env'

export class ServerLocalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const env = getLocalStackInfraEnv()

    const data = new DynamoDbConstruct(this, 'Data')

    const auth = new CognitoConstruct(this, 'Auth', {
      callbackUrls: env.callbackUrls,
      logoutUrls: env.logoutUrls,
      hostedUiDomainPrefix: env.hostedUiDomainPrefix,
      googleClientId: env.googleClientId,
      googleClientSecret: env.googleClientSecret,
    })

    // Order Processor Lambda phải được tạo trước SqsConstruct
    // vì SqsConstruct cần reference tới Lambda để attach Event Source Mapping
    const orderProcessor = new OrderProcessorConstruct(this, 'OrderProcessor', {
      ordersTable: data.ordersTable,
      orderItemsTable: data.orderItemsTable,
      inventoryTable: data.inventoryTable,
    })

    // SQS: tạo queue + DLQ + grant consume permissions + Event Source Mapping
    const messaging = new SqsConstruct(this, 'Messaging', {
      orderProcessorLambda: orderProcessor.handler,
    })

    const apiLambda = new LambdaApiConstruct(this, 'ApiLambda', {
      productsTable: data.productsTable,
      categoriesTable: data.categoriesTable,
      cartsTable: data.cartsTable,
      inventoryTable: data.inventoryTable,
      ordersTable: data.ordersTable,
      orderItemsTable: data.orderItemsTable,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
      orderProcessingQueueUrl: messaging.orderProcessingQueue.queueUrl,
    })

    // Grant API Lambda quyền send messages vào queue
    messaging.orderProcessingQueue.grantSendMessages(apiLambda.apiHandler)

    const api = new HttpApiConstruct(this, 'Api', {
      apiHandler: apiLambda.apiHandler,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
      clientOrigins: env.clientOrigins,
    })

    new S3Construct(this, 'Storage')
    new SesConstruct(this, 'Notification')

    // --- CloudFormation Outputs ---
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.api.apiEndpoint,
    })

    new cdk.CfnOutput(this, 'LocalStackApiGatewayUrl', {
      value: api.api.url ?? api.api.apiEndpoint,
    })

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: auth.userPool.userPoolId,
    })

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: auth.userPoolClient.userPoolClientId,
    })

    new cdk.CfnOutput(this, 'CognitoIssuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${auth.userPool.userPoolId}`,
    })

    new cdk.CfnOutput(this, 'LocalStackCognitoIssuer', {
      value: api.jwtIssuer,
    })

    new cdk.CfnOutput(this, 'HostedUiDomain', {
      value: auth.userPoolDomain.baseUrl(),
    })

    new cdk.CfnOutput(this, 'OrderProcessingQueueUrl', {
      value: messaging.orderProcessingQueue.queueUrl,
    })

    new cdk.CfnOutput(this, 'OrderProcessingDlqUrl', {
      value: messaging.orderProcessingDlq.queueUrl,
    })
  }
}
