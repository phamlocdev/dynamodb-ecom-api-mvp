import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({
  path: path.resolve(__dirname, '..', '..', '..', '.env'),
  override: true,
  quiet: true,
})

export interface LocalStackInfraEnv {
  account: string
  region: string
  callbackUrls: string[]
  logoutUrls: string[]
  hostedUiDomainPrefix: string
  clientOrigins: string[]
  googleClientId?: string
  googleClientSecret?: string
  productsTableName: string
  categoriesTableName: string
  cartsTableName: string
  cartItemsTableName: string
  ordersTableName: string
  orderItemsTableName: string
  inventoryTableName: string
  placeOrderQueueName: string
  placeOrderDlqName: string
  releaseReservationQueueName: string
  releaseReservationDlqName: string
  ordersEntityType: string
  localStackCognitoBaseUrl: string
  enableLocalStackCognitoTriggers: boolean
  enableLocalStackApiGatewayAuthorizer: boolean
  dynamoDbLambdaEndpoint: string
  cognitoIdpLambdaEndpoint: string
  paymentConfirmationTimeoutSeconds: string
}

let cachedEnv: LocalStackInfraEnv | undefined

export function getLocalStackInfraEnv(): LocalStackInfraEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  cachedEnv = {
    account: readEnv('CDK_DEFAULT_ACCOUNT', '000000000000'),
    region: readEnv('AWS_REGION', readEnv('AWS_DEFAULT_REGION', 'ap-southeast-1')),
    callbackUrls: splitCsvEnv('CLIENT_COGNITO_CALLBACK_URLS', [
      'http://localhost:3000/auth/callback',
    ]),
    logoutUrls: splitCsvEnv('CLIENT_COGNITO_LOGOUT_URLS', ['http://localhost:3000/auth/login']),
    hostedUiDomainPrefix: readEnv('COGNITO_DOMAIN_PREFIX', 'dynamodb-mvp-local'),
    clientOrigins: splitCsvEnv('CLIENT_CORS_ORIGINS', ['http://localhost:3000']),
    googleClientId: readOptionalEnv('GOOGLE_CLIENT_ID'),
    googleClientSecret: readOptionalEnv('GOOGLE_CLIENT_SECRET'),
    productsTableName: readEnv('PRODUCTS_TABLE', 'products'),
    categoriesTableName: readEnv('CATEGORIES_TABLE', 'categories'),
    cartsTableName: readEnv('CARTS_TABLE', 'carts'),
    cartItemsTableName: readEnv('CART_ITEMS_TABLE', 'cart-items'),
    ordersTableName: readEnv('ORDERS_TABLE', 'orders'),
    orderItemsTableName: readEnv('ORDER_ITEMS_TABLE', 'order-items'),
    inventoryTableName: readEnv('INVENTORY_TABLE', 'inventory'),
    placeOrderQueueName: readEnv('PLACE_ORDER_QUEUE_NAME', 'place-order.fifo'),
    placeOrderDlqName: readEnv('PLACE_ORDER_DLQ_NAME', 'place-order-dlq.fifo'),
    releaseReservationQueueName: readEnv(
      'RELEASE_RESERVATION_QUEUE_NAME',
      'release-reservation.fifo',
    ),
    releaseReservationDlqName: readEnv(
      'RELEASE_RESERVATION_DLQ_NAME',
      'release-reservation-dlq.fifo',
    ),
    ordersEntityType: readEnv('ORDERS_ENTITY_TYPE', 'ORDER'),
    localStackCognitoBaseUrl: readEnv(
      'LOCALSTACK_COGNITO_BASE_URL',
      'http://localhost.localstack.cloud:4566',
    ),
    enableLocalStackCognitoTriggers: readBooleanEnv('ENABLE_LOCALSTACK_COGNITO_TRIGGERS', true),
    enableLocalStackApiGatewayAuthorizer: readBooleanEnv(
      'ENABLE_LOCALSTACK_API_GATEWAY_AUTHORIZER',
      true,
    ),
    dynamoDbLambdaEndpoint: readEnv('DYNAMODB_LAMBDA_ENDPOINT', 'http://host.docker.internal:4566'),
    cognitoIdpLambdaEndpoint: readEnv(
      'COGNITO_IDP_LAMBDA_ENDPOINT',
      'http://host.docker.internal:4566',
    ),
    paymentConfirmationTimeoutSeconds: readEnv('PAYMENT_CONFIRMATION_SECONDS_TIMEOUT', '900'),
  }

  return cachedEnv
}

function splitCsvEnv(name: string, fallback: string[]): string[] {
  const value = readOptionalEnv(name)
  if (!value) {
    return fallback
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : fallback
}

function readEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readOptionalEnv(name)
  if (!value) {
    return fallback
  }

  return value.toLowerCase() === 'true'
}
