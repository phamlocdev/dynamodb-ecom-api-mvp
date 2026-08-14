import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'

const productsTableName = 'products'
const categoriesTableName = 'categories'
const defaultHostedUiCallbackUrl = 'http://localhost:3000/auth/hosted-ui/callback'
const defaultLogoutUrl = 'http://localhost:3000/auth/login'
const localStackCognitoBaseUrl = 'http://localhost.localstack.cloud:4566'
const enableLocalStackCognitoTriggers = true
const enableLocalStackApiGatewayAuthorizer = true

export class ServerLocalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const callbackUrls = splitCsvEnv('CLIENT_COGNITO_CALLBACK_URLS', [defaultHostedUiCallbackUrl])
    const logoutUrls = splitCsvEnv('CLIENT_COGNITO_LOGOUT_URLS', [defaultLogoutUrl])

    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: productsTableName,
      partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const categoriesTable = new dynamodb.Table(this, 'CategoriesTable', {
      tableName: categoriesTableName,
      partitionKey: { name: 'categoryId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true, username: true },
      autoVerify: { email: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false,
      },
    })

    if (enableLocalStackCognitoTriggers) {
      const postConfirmationHandler = new nodejs.NodejsFunction(this, 'PostConfirmationHandler', {
        runtime: lambda.Runtime.NODEJS_24_X,
        entry: path.join(__dirname, '..', '..', 'src', 'cognito', 'post-confirmation.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        bundling: {
          preCompilation: true,
          bundleAwsSDK: true,
          externalModules: [
            '@nestjs/microservices',
            '@nestjs/microservices/microservices-module',
            '@nestjs/websockets/socket-module',
            'class-transformer/storage',
          ],
          keepNames: true,
          minify: false,
          sourceMap: true,
          target: 'node24',
          tsconfig: path.join(__dirname, '..', '..', 'tsconfig.json'),
        },
        environment: {
          COGNITO_DEFAULT_GROUP: Role.customer,
        },
      })

      userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationHandler)
    }

    const userPoolClient = userPool.addClient('WebAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
      refreshTokenRotationGracePeriod: cdk.Duration.seconds(30),
      enableTokenRevocation: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls,
        defaultRedirectUri: callbackUrls[0],
      },
    })

    const hostedUiDomainPrefix = process.env.COGNITO_DOMAIN_PREFIX ?? 'dynamodb-mvp-local'
    const userPoolDomain = userPool.addDomain('HostedUiDomain', {
      cognitoDomain: {
        domainPrefix: hostedUiDomainPrefix,
      },
    })

    ;[Role.customer, Role.manager, Role.admin].forEach((groupName, index) => {
      new cognito.CfnUserPoolGroup(this, `${groupName}Group`, {
        groupName,
        precedence: index + 1,
        userPoolId: userPool.userPoolId,
      })
    })

    const apiHandler = new nodejs.NodejsFunction(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '..', '..', 'src', 'lambda.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: {
        preCompilation: true,
        bundleAwsSDK: true,
        externalModules: [
          '@nestjs/microservices',
          '@nestjs/microservices/microservices-module',
          '@nestjs/websockets/socket-module',
          'class-transformer/storage',
        ],
        keepNames: true,
        minify: false,
        sourceMap: true,
        target: 'node24',
        tsconfig: path.join(__dirname, '..', '..', 'tsconfig.json'),
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: () => [
            process.platform === 'win32'
              ? 'powershell -NoProfile -Command "Get-ChildItem -Path src -Recurse -Include *.js,*.js.map,*.d.ts | Remove-Item -Force"'
              : 'find src \\( -name "*.js" -o -name "*.js.map" -o -name "*.d.ts" \\) -delete',
          ],
        },
      },
      environment: {
        PRODUCTS_TABLE: productsTableName,
        CATEGORIES_TABLE: categoriesTableName,
        DYNAMODB_ENDPOINT: 'http://host.docker.internal:4566',
        COGNITO_IDP_ENDPOINT: 'http://host.docker.internal:4566',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    })

    productsTable.grantReadWriteData(apiHandler)
    categoriesTable.grantReadWriteData(apiHandler)

    const jwtIssuer = `${localStackCognitoBaseUrl}/${userPool.userPoolId}`

    const api = new apigatewayv2.HttpApi(this, 'NestHttpApi', {
      apiName: 'nestjs-ecommerce-local',
      createDefaultStage: true,
    })

    const integration = new integrations.HttpLambdaIntegration('ApiHandlerIntegration', apiHandler, {
      payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
    })
    const authorizer = enableLocalStackApiGatewayAuthorizer
      ? new authorizers.HttpJwtAuthorizer('AdminAuthorizer', jwtIssuer, {
          jwtAudience: [userPoolClient.userPoolClientId],
          identitySource: ['$request.header.Authorization'],
        })
      : undefined

    api.addRoutes({
      path: '/health',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    })

    api.addRoutes({
      path: '/products',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    })
    api.addRoutes({
      path: '/products',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      ...localRouteAuthOptions(authorizer),
    })
    api.addRoutes({
      path: '/products/{productId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    })
    api.addRoutes({
      path: '/products/{productId}',
      methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],
      integration,
      ...localRouteAuthOptions(authorizer),
    })

    api.addRoutes({
      path: '/categories',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    })
    api.addRoutes({
      path: '/categories',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      ...localRouteAuthOptions(authorizer),
    })
    api.addRoutes({
      path: '/categories/{categoryId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    })
    api.addRoutes({
      path: '/categories/{categoryId}',
      methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],
      integration,
      ...localRouteAuthOptions(authorizer),
    })
    api.addRoutes({
      path: '/users',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      ...localRouteAuthOptions(authorizer),
    })

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.apiEndpoint,
    })

    new cdk.CfnOutput(this, 'LocalStackApiGatewayUrl', {
      value: api.url ?? api.apiEndpoint,
    })

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
    })

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: userPoolClient.userPoolClientId,
    })

    new cdk.CfnOutput(this, 'CognitoIssuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
    })

    new cdk.CfnOutput(this, 'LocalStackCognitoIssuer', {
      value: jwtIssuer,
    })

    new cdk.CfnOutput(this, 'HostedUiDomain', {
      value: userPoolDomain.baseUrl(),
    })
  }
}

enum Role {
  customer = 'customer',
  manager = 'manager',
  admin = 'admin',
}

function splitCsvEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : fallback
}

function localRouteAuthOptions(
  authorizer?: authorizers.HttpJwtAuthorizer,
): Pick<apigatewayv2.AddRoutesOptions, 'authorizer'> {
  if (!enableLocalStackApiGatewayAuthorizer) {
    return {}
  }

  if (!authorizer) {
    throw new Error('JWT authorizer is enabled but was not created.')
  }

  return {
    authorizer,
  }
}
