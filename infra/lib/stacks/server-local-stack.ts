import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { CognitoConstruct } from '../constructs/auth/cognito.construct'
import { HttpApiConstruct } from '../constructs/api/http-api.construct'
import { LambdaApiConstruct } from '../constructs/api/lambda-api.construct'
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
    })

    const apiLambda = new LambdaApiConstruct(this, 'ApiLambda', {
      productsTable: data.productsTable,
      categoriesTable: data.categoriesTable,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
    })

    const api = new HttpApiConstruct(this, 'Api', {
      apiHandler: apiLambda.apiHandler,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.userPoolClient.userPoolClientId,
    })

    new S3Construct(this, 'Storage')
    new SqsConstruct(this, 'Messaging')
    new SesConstruct(this, 'Notification')

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
  }
}
