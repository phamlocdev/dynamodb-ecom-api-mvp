import * as path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import { aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib'
import { Construct } from 'constructs'

type LambdaDefinition = {
  id: string
  functionName: string
  assetFolder: string
}

const lambdaDefinitions: LambdaDefinition[] = [
  {
    id: 'CreateProductFunction',
    functionName: 'CreateProductFunction',
    assetFolder: 'create-product',
  },
  {
    id: 'ListProductsFunction',
    functionName: 'ListProductsFunction',
    assetFolder: 'list-products',
  },
  {
    id: 'GetProductFunction',
    functionName: 'GetProductFunction',
    assetFolder: 'get-product',
  },
  {
    id: 'UpdateProductFunction',
    functionName: 'UpdateProductFunction',
    assetFolder: 'update-product',
  },
  {
    id: 'DeleteProductFunction',
    functionName: 'DeleteProductFunction',
    assetFolder: 'delete-product',
  },
]

export class LocalstackLambdasStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const productsTableName = new cdk.CfnParameter(this, 'ProductsTableName', {
      type: 'String',
      default: 'products',
    })

    const dynamoDbEndpoint = new cdk.CfnParameter(this, 'DynamoDbEndpoint', {
      type: 'String',
      default: 'http://localhost.localstack.cloud:4566',
    })

    const lambdaRole = new iam.Role(this, 'ProductsLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    })

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Scan',
          'dynamodb:Query',
        ],
        resources: ['*'],
      }),
    )

    const assetRoot = path.resolve(process.cwd(), 'dist-lambda')

    for (const definition of lambdaDefinitions) {
      const codePath = path
        .join(assetRoot, definition.assetFolder)
        .replace(/\\/g, '/')

      new lambda.CfnFunction(this, definition.id, {
        functionName: definition.functionName,
        role: lambdaRole.roleArn,
        runtime: 'nodejs22.x',
        handler: 'index.handler',
        memorySize: 256,
        timeout: 10,
        architectures: ['x86_64'],
        code: {
          s3Bucket: 'hot-reload',
          s3Key: codePath,
        },
        environment: {
          variables: {
            PRODUCTS_TABLE: productsTableName.valueAsString,
            DYNAMODB_ENDPOINT: dynamoDbEndpoint.valueAsString,
          },
        },
      })
    }
  }
}
