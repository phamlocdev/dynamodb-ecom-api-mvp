import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import { categoriesTableName, productsTableName } from '../../config/constants'

export class DynamoDbConstruct extends Construct {
  readonly productsTable: dynamodb.Table
  readonly categoriesTable: dynamodb.Table

  constructor(scope: Construct, id: string) {
    super(scope, id)

    this.productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: productsTableName,
      partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    this.categoriesTable = new dynamodb.Table(this, 'CategoriesTable', {
      tableName: categoriesTableName,
      partitionKey: { name: 'categoryId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
  }
}
