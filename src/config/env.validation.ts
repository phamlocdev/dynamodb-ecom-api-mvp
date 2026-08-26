import { z } from 'zod'

const trimmedString = z.string().trim().min(1)

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1).optional(),
)

const urlString = z.string().trim().url()

const booleanFromEnv = z.preprocess(
  (value) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase()
    }

    return value
  },
  z.union([z.literal('true'), z.literal('false')]).transform((value) => value === 'true'),
)

const positiveIntegerFromEnv = z.coerce.number().int().positive()
const ipv4AddressString = z
  .string()
  .trim()
  .regex(
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/,
    'Expected a valid IPv4 address',
  )

function splitCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : fallback
}

const runtimeEnvSchema = z.object({
  PORT: positiveIntegerFromEnv.default(8000),
  AWS_REGION: trimmedString.default('ap-southeast-1'),
  AWS_DEFAULT_REGION: trimmedString.default('ap-southeast-1'),
  AWS_ACCESS_KEY_ID: trimmedString.default('test'),
  AWS_SECRET_ACCESS_KEY: trimmedString.default('test'),
  LOCALSTACK_AUTH_TOKEN: optionalTrimmedString,
  DYNAMODB_ENDPOINT: urlString.default('http://localhost:4566'),
  SQS_ENDPOINT: urlString.default('http://localhost:4566'),
  PRODUCTS_TABLE: trimmedString.default('products'),
  CATEGORIES_TABLE: trimmedString.default('categories'),
  CARTS_TABLE: trimmedString.default('carts'),
  CART_ITEMS_TABLE: trimmedString.default('cart-items'),
  INVENTORY_TABLE: trimmedString.default('inventory'),
  ORDERS_TABLE: trimmedString.default('orders'),
  ORDER_ITEMS_TABLE: trimmedString.default('order-items'),
  USER_PROFILES_TABLE: trimmedString.default('user-profiles'),
  UPLOAD_SESSIONS_TABLE: optionalTrimmedString,
  PLACE_ORDER_QUEUE_NAME: trimmedString.default('place-order.fifo'),
  PLACE_ORDER_DLQ_NAME: trimmedString.default('place-order-dlq.fifo'),
  PLACE_ORDER_QUEUE_URL: optionalTrimmedString,
  PROCESS_PAYMENT_QUEUE_URL: optionalTrimmedString,
  COGNITO_USER_POOL_ID: trimmedString.default('ap-southeast-1_XXXXXXXXX'),
  COGNITO_CLIENT_ID: trimmedString.default('xxxxxxxxxxxxxxxxxxxxxxxxxx'),
  COGNITO_IDP_ENDPOINT: urlString.default('http://localhost.localstack.cloud:4566'),
  COGNITO_DEFAULT_GROUP: trimmedString.default('customer'),
  LOCALSTACK_COGNITO_BASE_URL: urlString.default('http://localhost.localstack.cloud:4566'),
  COGNITO_IDP_LAMBDA_ENDPOINT: urlString.default('http://host.docker.internal:4566'),
  ENABLE_LOCALSTACK_COGNITO_TRIGGERS: booleanFromEnv.default(true),
  ENABLE_LOCALSTACK_API_GATEWAY_AUTHORIZER: booleanFromEnv.default(true),
  CLIENT_COGNITO_CALLBACK_URLS: trimmedString.default(
    'http://localhost:3000/auth/hosted-ui/callback',
  ),
  CLIENT_COGNITO_LOGOUT_URLS: trimmedString.default('http://localhost:3000/auth/login'),
  CLIENT_CORS_ORIGINS: trimmedString.default('http://localhost:3000'),
  COGNITO_DOMAIN_PREFIX: trimmedString.default('dynamodb-mvp-local'),
  DYNAMODB_LAMBDA_ENDPOINT: urlString.default('http://host.docker.internal:4566'),
  S3_ENDPOINT: optionalTrimmedString,
  S3_LAMBDA_ENDPOINT: optionalTrimmedString,
  S3_PUBLIC_ENDPOINT: optionalTrimmedString,
  MEDIA_BUCKET_NAME: trimmedString.default('ecommerce-media-local'),
  PRODUCT_IMAGE_MAX_COUNT: positiveIntegerFromEnv.default(10),
  UPLOAD_SESSION_TTL_HOURS: positiveIntegerFromEnv.optional(),
  MEDIA_READ_URL_TTL_SECONDS: positiveIntegerFromEnv.default(900),
  UPLOAD_MAX_FILE_SIZE_BYTES: positiveIntegerFromEnv.default(5242880),
  ORDERS_ENTITY_TYPE: trimmedString.default('ORDER'),
  PAYMENT_CONFIRMATION_SECONDS_TIMEOUT: positiveIntegerFromEnv.default(60),
  RESERVATION_EXPIRY_POLLER_SCHEDULE_MINUTES: positiveIntegerFromEnv.default(1),
  PLACE_ORDER_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  GOOGLE_CLIENT_ID: optionalTrimmedString,
  GOOGLE_CLIENT_SECRET: optionalTrimmedString,
  ADMIN_USERNAME: optionalTrimmedString,
  ADMIN_EMAIL: optionalTrimmedString,
  ADMIN_PASSWORD: optionalTrimmedString,
  CDK_DEFAULT_ACCOUNT: trimmedString.default('000000000000'),
  VNPAY_TMN_CODE: trimmedString.default('TEST12345'),
  VNPAY_SECURE_SECRET: trimmedString.default('SECRETKEY1234567890'),
  VNPAY_PAYMENT_URL: urlString.default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
  VNPAY_RETURN_URL: urlString.default('http://localhost:8000/payments/vnpay/return'),
  VNPAY_IPN_URL: urlString.default('http://localhost:8000/payments/vnpay/ipn'),
  VNPAY_LOCALE: z.enum(['vn', 'en']).default('vn'),
  VNPAY_ORDER_TYPE: trimmedString.default('other'),
  VNPAY_API_IP_ADDR: ipv4AddressString.default('127.0.0.1'),
})

const localStackInfraEnvSchema = runtimeEnvSchema.transform((environment) => ({
  account: environment.CDK_DEFAULT_ACCOUNT,
  region: environment.AWS_REGION || environment.AWS_DEFAULT_REGION,
  callbackUrls: splitCsv(environment.CLIENT_COGNITO_CALLBACK_URLS, [
    'http://localhost:3000/auth/callback',
  ]),
  logoutUrls: splitCsv(environment.CLIENT_COGNITO_LOGOUT_URLS, [
    'http://localhost:3000/auth/login',
  ]),
  hostedUiDomainPrefix: environment.COGNITO_DOMAIN_PREFIX,
  clientOrigins: splitCsv(environment.CLIENT_CORS_ORIGINS, ['http://localhost:3000']),
  googleClientId: environment.GOOGLE_CLIENT_ID,
  googleClientSecret: environment.GOOGLE_CLIENT_SECRET,
  productsTableName: environment.PRODUCTS_TABLE,
  categoriesTableName: environment.CATEGORIES_TABLE,
  cartsTableName: environment.CARTS_TABLE,
  cartItemsTableName: environment.CART_ITEMS_TABLE,
  ordersTableName: environment.ORDERS_TABLE,
  orderItemsTableName: environment.ORDER_ITEMS_TABLE,
  inventoryTableName: environment.INVENTORY_TABLE,
  userProfilesTableName: environment.USER_PROFILES_TABLE,
  placeOrderQueueName: environment.PLACE_ORDER_QUEUE_NAME,
  placeOrderDlqName: environment.PLACE_ORDER_DLQ_NAME,
  ordersEntityType: environment.ORDERS_ENTITY_TYPE,
  localStackCognitoBaseUrl: environment.LOCALSTACK_COGNITO_BASE_URL,
  enableLocalStackCognitoTriggers: environment.ENABLE_LOCALSTACK_COGNITO_TRIGGERS,
  enableLocalStackApiGatewayAuthorizer: environment.ENABLE_LOCALSTACK_API_GATEWAY_AUTHORIZER,
  dynamoDbLambdaEndpoint: environment.DYNAMODB_LAMBDA_ENDPOINT,
  cognitoIdpLambdaEndpoint: environment.COGNITO_IDP_LAMBDA_ENDPOINT,
  s3Endpoint: environment.S3_ENDPOINT,
  s3LambdaEndpoint: environment.S3_LAMBDA_ENDPOINT,
  s3PublicEndpoint: environment.S3_PUBLIC_ENDPOINT,
  mediaBucketName: environment.MEDIA_BUCKET_NAME,
  productImageMaxCount: environment.PRODUCT_IMAGE_MAX_COUNT,
  mediaReadUrlTtlSeconds: environment.MEDIA_READ_URL_TTL_SECONDS,
  uploadMaxFileSizeBytes: environment.UPLOAD_MAX_FILE_SIZE_BYTES,
  paymentConfirmationTimeoutSeconds: environment.PAYMENT_CONFIRMATION_SECONDS_TIMEOUT,
  reservationExpiryPollerScheduleMinutes: environment.RESERVATION_EXPIRY_POLLER_SCHEDULE_MINUTES,
  vnpayTmnCode: environment.VNPAY_TMN_CODE,
  vnpaySecureSecret: environment.VNPAY_SECURE_SECRET,
  vnpayPaymentUrl: environment.VNPAY_PAYMENT_URL,
  vnpayReturnUrl: environment.VNPAY_RETURN_URL,
  vnpayIpnUrl: environment.VNPAY_IPN_URL,
  vnpayLocale: environment.VNPAY_LOCALE,
  vnpayOrderType: environment.VNPAY_ORDER_TYPE,
  vnpayApiIpAddr: environment.VNPAY_API_IP_ADDR,
}))

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>
export type LocalStackInfraEnv = z.infer<typeof localStackInfraEnvSchema>

export function validateRuntimeEnv(environment: Record<string, unknown>): RuntimeEnv {
  return runtimeEnvSchema.parse(environment)
}

export function validateLocalStackInfraEnv(
  environment: Record<string, unknown>,
): LocalStackInfraEnv {
  return localStackInfraEnvSchema.parse(environment)
}
