import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import {
  cartsTableName,
  categoriesTableName,
  inventoryTableName,
  orderItemsTableName,
  ordersTableName,
  productsTableName,
} from '../../config/constants'

export class DynamoDbConstruct extends Construct {
  readonly productsTable: dynamodb.Table
  readonly categoriesTable: dynamodb.Table
  readonly cartsTable: dynamodb.Table
  readonly inventoryTable: dynamodb.Table
  readonly ordersTable: dynamodb.Table
  readonly orderItemsTable: dynamodb.Table

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

    // Cart: composite PK (userId + productId) — mỗi dòng là 1 cart item
    this.cartsTable = new dynamodb.Table(this, 'CartsTable', {
      tableName: cartsTableName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Inventory: PK productId — tách stock khỏi products table
    this.inventoryTable = new dynamodb.Table(this, 'InventoryTable', {
      tableName: inventoryTableName,
      partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Orders: PK orderId — order header
    this.ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: ordersTableName,
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // OrderItems: composite PK (orderId + productId) — line items của order
    this.orderItemsTable = new dynamodb.Table(this, 'OrderItemsTable', {
      tableName: orderItemsTableName,
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
  }
}
