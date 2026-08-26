import * as cdk from 'aws-cdk-lib'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { getAwsInfraEnv } from './config/env'
import { HttpApiConstruct } from './constructs/api/http-api.construct'
import { LambdaApiConstruct } from './constructs/api/lambda-api.construct'
import { CognitoConstruct } from './constructs/auth/cognito.construct'
import { DynamoDbConstruct } from './constructs/data/dynamodb.construct'
import { OrdersWorkersConstruct } from './constructs/messaging/orders-workers.construct'
import { SqsConstruct } from './constructs/messaging/sqs.construct'
import { SesConstruct } from './constructs/notification/ses.construct'
import { ImageProcessorConstruct } from './constructs/storage/image-processor.construct'
import { S3Construct } from './constructs/storage/s3.construct'

export class ServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const env = getAwsInfraEnv()

    const data = new DynamoDbConstruct(this, 'Data')

    const messaging = new SqsConstruct(this, 'Messaging', {
      visibilityTimeout: cdk.Duration.seconds(90),
    })

    const vnpaySecret = new secretsmanager.Secret(this, 'VnpaySecret', {
      secretName: env.vnpaySecretName,
      description: 'VNPay credentials for ecommerce dev',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ tmnCode: 'replace-me' }),
        generateStringKey: 'secureSecret',
        excludePunctuation: true,
      },
    })

    const googleClientSecret = new secretsmanager.Secret(this, 'GoogleClientSecret', {
      secretName: env.googleClientSecretName,
      description: 'Google OAuth client secret for ecommerce dev Cognito federation',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      generateSecretString: {
        passwordLength: 40,
        excludePunctuation: true,
      },
    })

    const auth = new CognitoConstruct(this, 'Auth', {
      callbackUrls: env.callbackUrls,
      logoutUrls: env.logoutUrls,
      hostedUiDomainPrefix: env.hostedUiDomainPrefix,
      googleClientId: env.googleClientId,
      googleClientSecret,
    })

    const storage = new S3Construct(this, 'Storage', {
      bucketName: env.mediaBucketName,
      clientOrigins: env.clientOrigins,
    })

    new ImageProcessorConstruct(this, 'ImageProcessor', {
      mediaBucket: storage.mediaBucket,
    })

    const apiLambda = new LambdaApiConstruct(this, 'ApiLambda', {
      productsTable: data.productsTable,
      categoriesTable: data.categoriesTable,
      cartsTable: data.cartsTable,
      cartItemsTable: data.cartItemsTable,
      ordersTable: data.ordersTable,
      orderItemsTable: data.orderItemsTable,
      inventoryTable: data.inventoryTable,
      userProfilesTable: data.userProfilesTable,
      mediaBucket: storage.mediaBucket,
      placeOrderQueue: messaging.placeOrderQueue,
      vnpaySecret,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
    })

    new OrdersWorkersConstruct(this, 'OrdersWorkers', {
      productsTable: data.productsTable,
      cartsTable: data.cartsTable,
      cartItemsTable: data.cartItemsTable,
      ordersTable: data.ordersTable,
      orderItemsTable: data.orderItemsTable,
      inventoryTable: data.inventoryTable,
      placeOrderQueue: messaging.placeOrderQueue,
      vnpaySecret,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
    })

    const api = new HttpApiConstruct(this, 'Api', {
      apiHandler: apiLambda.apiHandler,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
      clientOrigins: env.clientOrigins,
    })

    new SesConstruct(this, 'Notification')

    new cdk.CfnOutput(this, 'ProductsTableName', { value: data.productsTable.tableName })

    new cdk.CfnOutput(this, 'OrdersTableName', { value: data.ordersTable.tableName })

    new cdk.CfnOutput(this, 'VnpaySecretName', {
      value: env.vnpaySecretName,
    })

    new cdk.CfnOutput(this, 'GoogleClientSecretName', {
      value: env.googleClientSecretName,
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

    new cdk.CfnOutput(this, 'HostedUiDomain', {
      value: auth.userPoolDomain.baseUrl(),
    })

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.api.apiEndpoint,
    })

    new cdk.CfnOutput(this, 'PlaceOrderQueueUrl', {
      value: messaging.placeOrderQueue.queueUrl,
    })

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: storage.mediaBucket.bucketName,
    })
  }
}
