import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import { Construct } from 'constructs'
import { getLocalStackInfraEnv } from '../../config/env'
import { createNodejsBundling, removeGeneratedSourceArtifacts } from '../../shared/lambda-bundling'

export interface LambdaApiConstructProps {
  productsTable: dynamodb.ITable
  categoriesTable: dynamodb.ITable
  cartsTable: dynamodb.ITable
  cartItemsTable: dynamodb.ITable
  ordersTable: dynamodb.ITable
  orderItemsTable: dynamodb.ITable
  inventoryTable: dynamodb.ITable
  userProfilesTable: dynamodb.ITable
  mediaBucket: s3.IBucket
  placeOrderQueue: sqs.IQueue
  userPoolId: string
  userPoolClientId: string
}

export class LambdaApiConstruct extends Construct {
  readonly apiHandler: nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props: LambdaApiConstructProps) {
    super(scope, id)
    const infraEnv = getLocalStackInfraEnv()

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
        PRODUCTS_TABLE: infraEnv.productsTableName,
        CATEGORIES_TABLE: infraEnv.categoriesTableName,
        CARTS_TABLE: infraEnv.cartsTableName,
        CART_ITEMS_TABLE: infraEnv.cartItemsTableName,
        ORDERS_TABLE: infraEnv.ordersTableName,
        ORDER_ITEMS_TABLE: infraEnv.orderItemsTableName,
        INVENTORY_TABLE: infraEnv.inventoryTableName,
        USER_PROFILES_TABLE: infraEnv.userProfilesTableName,
        DYNAMODB_ENDPOINT: infraEnv.dynamoDbLambdaEndpoint,
        MEDIA_BUCKET_NAME: props.mediaBucket.bucketName,
        PRODUCT_IMAGE_MAX_COUNT: String(infraEnv.productImageMaxCount),
        MEDIA_READ_URL_TTL_SECONDS: String(infraEnv.mediaReadUrlTtlSeconds),
        UPLOAD_MAX_FILE_SIZE_BYTES: String(infraEnv.uploadMaxFileSizeBytes),
        COGNITO_IDP_ENDPOINT: infraEnv.cognitoIdpLambdaEndpoint,
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
        PLACE_ORDER_QUEUE_URL: props.placeOrderQueue.queueUrl,
        PLACE_ORDER_QUEUE_NAME: infraEnv.placeOrderQueueName,
        PAYMENT_CONFIRMATION_SECONDS_TIMEOUT: String(infraEnv.paymentConfirmationTimeoutSeconds),
        VNPAY_TMN_CODE: infraEnv.vnpayTmnCode,
        VNPAY_SECURE_SECRET: infraEnv.vnpaySecureSecret,
        VNPAY_PAYMENT_URL: infraEnv.vnpayPaymentUrl,
        VNPAY_RETURN_URL: infraEnv.vnpayReturnUrl,
        VNPAY_IPN_URL: infraEnv.vnpayIpnUrl,
        VNPAY_LOCALE: infraEnv.vnpayLocale,
        VNPAY_ORDER_TYPE: infraEnv.vnpayOrderType,
        VNPAY_API_IP_ADDR: infraEnv.vnpayApiIpAddr,
        ...(infraEnv.s3Endpoint ? { S3_ENDPOINT: infraEnv.s3Endpoint } : {}),
        ...(infraEnv.s3LambdaEndpoint ? { S3_LAMBDA_ENDPOINT: infraEnv.s3LambdaEndpoint } : {}),
        ...(infraEnv.s3PublicEndpoint ? { S3_PUBLIC_ENDPOINT: infraEnv.s3PublicEndpoint } : {}),
      },
    })

    props.productsTable.grantReadWriteData(this.apiHandler)
    props.categoriesTable.grantReadWriteData(this.apiHandler)
    props.cartsTable.grantReadWriteData(this.apiHandler)
    props.cartItemsTable.grantReadWriteData(this.apiHandler)
    props.ordersTable.grantReadWriteData(this.apiHandler)
    props.orderItemsTable.grantReadWriteData(this.apiHandler)
    props.inventoryTable.grantReadWriteData(this.apiHandler)
    props.userProfilesTable.grantReadWriteData(this.apiHandler)
    props.placeOrderQueue.grantSendMessages(this.apiHandler)
    this.apiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [props.mediaBucket.arnForObjects('*')],
      }),
    )

    this.apiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:TransactWriteItems'],
        resources: [props.ordersTable.tableArn, props.inventoryTable.tableArn],
      }),
    )
  }
}
