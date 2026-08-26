import { z } from 'zod'

const trimmedString = z.string().trim().min(1)
const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  return value.trim() || undefined
}, z.string().min(1).optional())
const urlString = z.string().trim().url()
const positiveIntegerFromEnv = z.coerce.number().int().positive()
const ipv4AddressString = z
  .string()
  .trim()
  .regex(
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/,
    'Expected a valid IPv4 address',
  )

function splitCsv(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : fallback
}

const runtimeEnvSchema = z.object({
  PORT: positiveIntegerFromEnv.default(8000),
  AWS_REGION: trimmedString.default('ap-southeast-1'),
  AWS_DEFAULT_REGION: trimmedString.default('ap-southeast-1'),
  PRODUCTS_TABLE: trimmedString.default('products'),
  CATEGORIES_TABLE: trimmedString.default('categories'),
  CARTS_TABLE: trimmedString.default('carts'),
  CART_ITEMS_TABLE: trimmedString.default('cart-items'),
  INVENTORY_TABLE: trimmedString.default('inventory'),
  ORDERS_TABLE: trimmedString.default('orders'),
  ORDER_ITEMS_TABLE: trimmedString.default('order-items'),
  USER_PROFILES_TABLE: trimmedString.default('user-profiles'),
  PLACE_ORDER_QUEUE_NAME: trimmedString.default('place-order.fifo'),
  PLACE_ORDER_DLQ_NAME: trimmedString.default('place-order-dlq.fifo'),
  PLACE_ORDER_QUEUE_URL: optionalTrimmedString,
  COGNITO_USER_POOL_ID: optionalTrimmedString,
  COGNITO_CLIENT_ID: optionalTrimmedString,
  COGNITO_DEFAULT_GROUP: trimmedString.default('customer'),
  CLIENT_COGNITO_CALLBACK_URLS: trimmedString.default(
    'http://localhost:3000/auth/hosted-ui/callback',
  ),
  CLIENT_COGNITO_LOGOUT_URLS: trimmedString.default('http://localhost:3000/auth/login'),
  CLIENT_CORS_ORIGINS: trimmedString.default('http://localhost:3000'),
  COGNITO_DOMAIN_PREFIX: trimmedString.default('ecommerce-dev'),
  MEDIA_BUCKET_NAME: trimmedString.default('ecommerce-media-dev'),
  PRODUCT_IMAGE_MAX_COUNT: positiveIntegerFromEnv.default(10),
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
  CDK_DEFAULT_ACCOUNT: optionalTrimmedString,
  VNPAY_TMN_CODE: trimmedString.default('replace-me'),
  VNPAY_SECURE_SECRET: trimmedString.default('replace-me'),
  VNPAY_PAYMENT_URL: urlString.default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
  VNPAY_RETURN_URL: urlString.default('http://localhost:8000/payments/vnpay/return'),
  VNPAY_IPN_URL: urlString.default('http://localhost:8000/payments/vnpay/ipn'),
  VNPAY_LOCALE: z.enum(['vn', 'en']).default('vn'),
  VNPAY_ORDER_TYPE: trimmedString.default('other'),
  VNPAY_API_IP_ADDR: ipv4AddressString.default('127.0.0.1'),
})

const awsInfraEnvSchema = runtimeEnvSchema.transform((environment) => {
  if (!environment.CDK_DEFAULT_ACCOUNT || !/^\d{12}$/.test(environment.CDK_DEFAULT_ACCOUNT)) {
    throw new Error('CDK_DEFAULT_ACCOUNT must be your 12-digit AWS account ID.')
  }

  return {
    account: environment.CDK_DEFAULT_ACCOUNT,
    region: environment.AWS_REGION,
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
  }
})

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>
export type AwsInfraEnv = z.infer<typeof awsInfraEnvSchema>

export function validateRuntimeEnv(environment: Record<string, unknown>): RuntimeEnv {
  return runtimeEnvSchema.parse(environment)
}

export function validateAwsInfraEnv(environment: Record<string, unknown>): AwsInfraEnv {
  return awsInfraEnvSchema.parse(environment)
}
