import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'

const productsTableName = 'products'
const categoriesTableName = 'categories'

export class ServerLocalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

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

    const apiHandler = new nodejs.NodejsFunction(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
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
        target: 'node20',
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
      },
    })

    productsTable.grantReadWriteData(apiHandler)
    categoriesTable.grantReadWriteData(apiHandler)

    const api = new apigateway.LambdaRestApi(this, 'NestRestApi', {
      handler: apiHandler,
      proxy: true,
      restApiName: 'nestjs-ecommerce-local',
      deployOptions: {
        stageName: 'local',
      },
    })

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
    })

    new cdk.CfnOutput(this, 'LocalStackApiGatewayUrl', {
      value: `http://${api.restApiId}.execute-api.localhost.localstack.cloud:4566/local/`,
    })

    new cdk.CfnOutput(this, 'LocalStackApiGatewayFallbackUrl', {
      value: `http://localhost:4566/_aws/execute-api/${api.restApiId}/local/`,
    })
  }
}
