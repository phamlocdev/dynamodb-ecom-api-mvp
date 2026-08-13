import * as path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import {
  aws_apigateway as apigateway,
  aws_iam as iam,
  aws_lambda as lambda,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

type LambdaDefinition = {
  id: string
  functionName: string
  assetFolder: string
  route: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    path:
      | '/products'
      | '/products/{productId}'
      | '/categories'
      | '/categories/{categoryId}'
  }
}

const lambdaDefinitions: LambdaDefinition[] = [
  {
    id: 'CreateProductFunction',
    functionName: 'CreateProductFunction',
    assetFolder: 'create-product',
    route: {
      method: 'POST',
      path: '/products',
    },
  },
  {
    id: 'ListProductsFunction',
    functionName: 'ListProductsFunction',
    assetFolder: 'list-products',
    route: {
      method: 'GET',
      path: '/products',
    },
  },
  {
    id: 'GetProductFunction',
    functionName: 'GetProductFunction',
    assetFolder: 'get-product',
    route: {
      method: 'GET',
      path: '/products/{productId}',
    },
  },
  {
    id: 'UpdateProductFunction',
    functionName: 'UpdateProductFunction',
    assetFolder: 'update-product',
    route: {
      method: 'PATCH',
      path: '/products/{productId}',
    },
  },
  {
    id: 'DeleteProductFunction',
    functionName: 'DeleteProductFunction',
    assetFolder: 'delete-product',
    route: {
      method: 'DELETE',
      path: '/products/{productId}',
    },
  },
  {
    id: 'CreateCategoryFunction',
    functionName: 'CreateCategoryFunction',
    assetFolder: 'create-category',
    route: {
      method: 'POST',
      path: '/categories',
    },
  },
  {
    id: 'ListCategoriesFunction',
    functionName: 'ListCategoriesFunction',
    assetFolder: 'list-categories',
    route: {
      method: 'GET',
      path: '/categories',
    },
  },
  {
    id: 'GetCategoryFunction',
    functionName: 'GetCategoryFunction',
    assetFolder: 'get-category',
    route: {
      method: 'GET',
      path: '/categories/{categoryId}',
    },
  },
  {
    id: 'UpdateCategoryFunction',
    functionName: 'UpdateCategoryFunction',
    assetFolder: 'update-category',
    route: {
      method: 'PATCH',
      path: '/categories/{categoryId}',
    },
  },
  {
    id: 'DeleteCategoryFunction',
    functionName: 'DeleteCategoryFunction',
    assetFolder: 'delete-category',
    route: {
      method: 'DELETE',
      path: '/categories/{categoryId}',
    },
  },
]

const localDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

export class LocalstackLambdasStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const productsTableName = new cdk.CfnParameter(this, 'ProductsTableName', {
      type: 'String',
      default: 'products',
    })

    const categoriesTableName = new cdk.CfnParameter(this, 'CategoriesTableName', {
      type: 'String',
      default: 'categories',
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
    const lambdaFunctions = new Map<string, lambda.IFunction>()

    for (const definition of lambdaDefinitions) {
      const codePath = path
        .join(assetRoot, definition.assetFolder)
        .replace(/\\/g, '/')

      const functionResource = new lambda.CfnFunction(this, definition.id, {
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
            CATEGORIES_TABLE: categoriesTableName.valueAsString,
            DYNAMODB_ENDPOINT: dynamoDbEndpoint.valueAsString,
          },
        },
      })

      lambdaFunctions.set(
        definition.id,
        lambda.Function.fromFunctionAttributes(this, `${definition.id}Imported`, {
          functionArn: functionResource.attrArn,
          sameEnvironment: true,
        }),
      )
    }

    const restApi = new apigateway.RestApi(this, 'ProductsRestApi', {
      restApiName: 'CatalogLocalStackApi',
      deployOptions: {
        stageName: 'local',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: localDevOrigins,
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PATCH', 'DELETE'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    })

    const productsResource = restApi.root.addResource('products')
    const productByIdResource = productsResource.addResource('{productId}')
    const categoriesResource = restApi.root.addResource('categories')
    const categoryByIdResource = categoriesResource.addResource('{categoryId}')

    for (const definition of lambdaDefinitions) {
      const functionHandler = lambdaFunctions.get(definition.id)

      if (!functionHandler) {
        throw new Error(`Lambda function ${definition.id} was not created.`)
      }

      const targetResource = getTargetResource(
        definition.route.path,
        productsResource,
        productByIdResource,
        categoriesResource,
        categoryByIdResource,
      )

      targetResource.addMethod(
        definition.route.method,
        new apigateway.LambdaIntegration(functionHandler),
      )
    }

    new cdk.CfnOutput(this, 'ProductsApiBaseUrl', {
      value: `http://${restApi.restApiId}.execute-api.localhost.localstack.cloud:4566/${restApi.deploymentStage.stageName}`,
    })
  }
}

function getTargetResource(
  path: LambdaDefinition['route']['path'],
  productsResource: apigateway.IResource,
  productByIdResource: apigateway.IResource,
  categoriesResource: apigateway.IResource,
  categoryByIdResource: apigateway.IResource,
): apigateway.IResource {
  switch (path) {
    case '/products':
      return productsResource
    case '/products/{productId}':
      return productByIdResource
    case '/categories':
      return categoriesResource
    case '/categories/{categoryId}':
      return categoryByIdResource
  }
}
