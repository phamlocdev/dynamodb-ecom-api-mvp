import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { Construct } from 'constructs'
import { getLocalStackInfraEnv } from '../../config/env'
import { registerApiRoutes } from './api-routes'

export interface HttpApiConstructProps {
  apiHandler: lambda.IFunction
  userPoolId: string
  userPoolClientId: string
  clientOrigins: string[]
}

export class HttpApiConstruct extends Construct {
  readonly api: apigatewayv2.HttpApi
  readonly jwtIssuer: string
  readonly authorizer?: authorizers.HttpJwtAuthorizer

  constructor(scope: Construct, id: string, props: HttpApiConstructProps) {
    super(scope, id)
    const infraEnv = getLocalStackInfraEnv()

    this.jwtIssuer = `${infraEnv.localStackCognitoBaseUrl}/${props.userPoolId}`

    this.api = new apigatewayv2.HttpApi(this, 'NestHttpApi', {
      apiName: 'nestjs-ecommerce-local',
      createDefaultStage: true,
      corsPreflight: {
        allowOrigins: props.clientOrigins,
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type'],
      },
    })

    const integration = new integrations.HttpLambdaIntegration(
      'ApiHandlerIntegration',
      props.apiHandler,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      },
    )

    this.authorizer = infraEnv.enableLocalStackApiGatewayAuthorizer
      ? new authorizers.HttpJwtAuthorizer('AdminAuthorizer', this.jwtIssuer, {
          jwtAudience: [props.userPoolClientId],
          identitySource: ['$request.header.Authorization'],
        })
      : undefined

    registerApiRoutes(this.api, integration, this.authorizer)
  }
}
