import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import { categoriesTableName, productsTableName } from '../../config/constants'
import { createNodejsBundling, removeGeneratedSourceArtifacts } from '../../shared/lambda-bundling'

export interface LambdaApiConstructProps {
  productsTable: dynamodb.ITable
  categoriesTable: dynamodb.ITable
  userPoolId: string
  userPoolClientId: string
}

export class LambdaApiConstruct extends Construct {
  readonly apiHandler: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: LambdaApiConstructProps) {
    super(scope, id)

    this.apiHandler = new nodejs.NodejsFunction(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '..', '..', '..', '..', 'src', 'lambda.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: createNodejsBundling({
        afterBundling: () => removeGeneratedSourceArtifacts(),
      }),
      environment: {
        PRODUCTS_TABLE: productsTableName,
        CATEGORIES_TABLE: categoriesTableName,
        DYNAMODB_ENDPOINT: 'http://host.docker.internal:4566',
        COGNITO_IDP_ENDPOINT: 'http://host.docker.internal:4566',
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
      },
    })

    props.productsTable.grantReadWriteData(this.apiHandler)
    props.categoriesTable.grantReadWriteData(this.apiHandler)
  }
}
