import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import { getAwsInfraEnv } from '../../config/env'

export class DynamoDbConstruct extends Construct {
  readonly ecommerceTable: dynamodb.Table
  readonly productsTable: dynamodb.Table
  readonly categoriesTable: dynamodb.Table
  readonly cartsTable: dynamodb.Table
  readonly cartItemsTable: dynamodb.Table
  readonly ordersTable: dynamodb.Table
  readonly orderItemsTable: dynamodb.Table
  readonly inventoryTable: dynamodb.Table
  readonly userProfilesTable: dynamodb.Table

  constructor(scope: Construct, id: string) {
    super(scope, id)
    const infraEnv = getAwsInfraEnv()

    this.ecommerceTable = new dynamodb.Table(this, 'EcommerceTable', {
      tableName: infraEnv.ecommerceTableName,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })
    this.ecommerceTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    })
    this.ecommerceTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    })
    this.ecommerceTable.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.STRING },
    })
    this.ecommerceTable.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.STRING },
    })
    this.ecommerceTable.addGlobalSecondaryIndex({
      indexName: 'GSI5',
      partitionKey: { name: 'GSI5PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI5SK', type: dynamodb.AttributeType.STRING },
    })
    this.ecommerceTable.addGlobalSecondaryIndex({
      indexName: 'GSI6',
      partitionKey: { name: 'GSI6PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI6SK', type: dynamodb.AttributeType.STRING },
    })

    this.productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: infraEnv.productsTableName,
      partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.categoriesTable = new dynamodb.Table(this, 'CategoriesTable', {
      tableName: infraEnv.categoriesTableName,
      partitionKey: { name: 'categoryId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.cartsTable = new dynamodb.Table(this, 'CartsTable', {
      tableName: infraEnv.cartsTableName,
      partitionKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'cartId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.cartItemsTable = new dynamodb.Table(this, 'CartItemsTable', {
      tableName: infraEnv.cartItemsTableName,
      partitionKey: { name: 'cartId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: infraEnv.ordersTableName,
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'GSI_OrderStatusCreatedAt',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    })
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'GSI_OrderCreatedAt',
      partitionKey: { name: 'entityType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    })
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'GSI_CustomerOrders',
      partitionKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    })
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'GSI_CustomerEmailOrders',
      partitionKey: { name: 'customerEmail', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    })
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'GSI_OrderStatusPaymentExpiresAt',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'paymentExpiresAt', type: dynamodb.AttributeType.NUMBER },
    })

    this.orderItemsTable = new dynamodb.Table(this, 'OrderItemsTable', {
      tableName: infraEnv.orderItemsTableName,
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lineId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.inventoryTable = new dynamodb.Table(this, 'InventoryTable', {
      tableName: infraEnv.inventoryTableName,
      partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.userProfilesTable = new dynamodb.Table(this, 'UserProfilesTable', {
      tableName: infraEnv.userProfilesTableName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    new cdk.CfnOutput(this, 'OrdersEntityType', {
      value: infraEnv.ordersEntityType,
    })
    new cdk.CfnOutput(this, 'EcommerceTableName', {
      value: infraEnv.ecommerceTableName,
    })
  }
}
