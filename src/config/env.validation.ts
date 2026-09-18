import { z } from 'zod'

const requiredString = z.string().min(1)
const emailString = z.string().email()
const urlString = z.string().url()
const positiveIntegerFromEnv = z.coerce.number().int().positive()
const nonNegativeIntegerFromEnv = z.coerce.number().int().nonnegative()
const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true')
const ipv4AddressString = z.string().regex(
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/,
  'Expected a valid IPv4 address',
)

function splitCsv(value: string): string[] {
  return value.split(',').filter(Boolean)
}

function splitCsvEmails(value: string): string[] {
  return splitCsv(value).map((email) => emailString.parse(email))
}

const awsInfraEnvSchema = z
  .object({
    AWS_REGION: requiredString,
    AWS_DEFAULT_REGION: requiredString,
    PRODUCTS_TABLE: requiredString,
    CATEGORIES_TABLE: requiredString,
    CARTS_TABLE: requiredString,
    CART_ITEMS_TABLE: requiredString,
    INVENTORY_TABLE: requiredString,
    ORDERS_TABLE: requiredString,
    ORDER_ITEMS_TABLE: requiredString,
    EMAIL_TRACKING_TABLE: requiredString,
    EVENT_CONSUMER_IDEMPOTENCY_TABLE: requiredString,
    USER_ACCOUNTS_TABLE: requiredString,
    USER_LOGIN_AUDIT_TABLE: requiredString,
    PLACE_ORDER_QUEUE_NAME: requiredString,
    PLACE_ORDER_DLQ_NAME: requiredString,
    ORDER_EVENTS_BUS_NAME: requiredString,
    COGNITO_DISPOSABLE_EMAIL_DOMAINS: requiredString,
    CLIENT_COGNITO_CALLBACK_URLS: requiredString,
    CLIENT_COGNITO_LOGOUT_URLS: requiredString,
    CLIENT_CORS_ORIGINS: requiredString,
    COGNITO_DOMAIN_PREFIX: requiredString,
    MEDIA_BUCKET_NAME: requiredString,
    PRODUCT_IMAGE_MAX_COUNT: positiveIntegerFromEnv,
    MEDIA_READ_URL_TTL_SECONDS: positiveIntegerFromEnv,
    UPLOAD_MAX_FILE_SIZE_BYTES: positiveIntegerFromEnv,
    ORDERS_ENTITY_TYPE: requiredString,
    PAYMENT_CONFIRMATION_SECONDS_TIMEOUT: positiveIntegerFromEnv,
    RESERVATION_EXPIRY_POLLER_SCHEDULE_MINUTES: positiveIntegerFromEnv,
    PLACE_ORDER_DELAY_MS: nonNegativeIntegerFromEnv,
    GOOGLE_CLIENT_ID: requiredString,
    GOOGLE_CLIENT_SECRET_NAME: requiredString,
    CDK_DEFAULT_ACCOUNT: z.string().regex(/^\d{12}$/),
    VNPAY_SECRET_NAME: requiredString,
    VNPAY_PAYMENT_URL: urlString,
    VNPAY_RETURN_URL: urlString,
    VNPAY_IPN_URL: urlString,
    VNPAY_LOCALE: z.enum(['vn', 'en']),
    VNPAY_ORDER_TYPE: requiredString,
    VNPAY_API_IP_ADDR: ipv4AddressString,
    SES_ENABLED: booleanFromEnv,
    SES_FROM_EMAIL: emailString,
    SES_VERIFIED_RECIPIENTS: requiredString,
    SES_CONFIGURATION_SET_NAME: requiredString,
  })
  .transform((environment) => ({
    account: environment.CDK_DEFAULT_ACCOUNT,
    region: environment.AWS_REGION,
    callbackUrls: splitCsv(environment.CLIENT_COGNITO_CALLBACK_URLS),
    logoutUrls: splitCsv(environment.CLIENT_COGNITO_LOGOUT_URLS),
    hostedUiDomainPrefix: environment.COGNITO_DOMAIN_PREFIX,
    clientOrigins: splitCsv(environment.CLIENT_CORS_ORIGINS),
    googleClientId: environment.GOOGLE_CLIENT_ID,
    googleClientSecretName: environment.GOOGLE_CLIENT_SECRET_NAME,
    productsTableName: environment.PRODUCTS_TABLE,
    categoriesTableName: environment.CATEGORIES_TABLE,
    cartsTableName: environment.CARTS_TABLE,
    cartItemsTableName: environment.CART_ITEMS_TABLE,
    ordersTableName: environment.ORDERS_TABLE,
    orderItemsTableName: environment.ORDER_ITEMS_TABLE,
    emailTrackingTableName: environment.EMAIL_TRACKING_TABLE,
    eventConsumerIdempotencyTableName: environment.EVENT_CONSUMER_IDEMPOTENCY_TABLE,
    inventoryTableName: environment.INVENTORY_TABLE,
    userAccountsTableName: environment.USER_ACCOUNTS_TABLE,
    userLoginAuditTableName: environment.USER_LOGIN_AUDIT_TABLE,
    cognitoDisposableEmailDomains: splitCsv(environment.COGNITO_DISPOSABLE_EMAIL_DOMAINS),
    placeOrderQueueName: environment.PLACE_ORDER_QUEUE_NAME,
    placeOrderDlqName: environment.PLACE_ORDER_DLQ_NAME,
    orderEventsBusName: environment.ORDER_EVENTS_BUS_NAME,
    ordersEntityType: environment.ORDERS_ENTITY_TYPE,
    mediaBucketName: environment.MEDIA_BUCKET_NAME,
    productImageMaxCount: environment.PRODUCT_IMAGE_MAX_COUNT,
    mediaReadUrlTtlSeconds: environment.MEDIA_READ_URL_TTL_SECONDS,
    uploadMaxFileSizeBytes: environment.UPLOAD_MAX_FILE_SIZE_BYTES,
    paymentConfirmationTimeoutSeconds: environment.PAYMENT_CONFIRMATION_SECONDS_TIMEOUT,
    reservationExpiryPollerScheduleMinutes: environment.RESERVATION_EXPIRY_POLLER_SCHEDULE_MINUTES,
    vnpaySecretName: environment.VNPAY_SECRET_NAME,
    vnpayPaymentUrl: environment.VNPAY_PAYMENT_URL,
    vnpayReturnUrl: environment.VNPAY_RETURN_URL,
    vnpayIpnUrl: environment.VNPAY_IPN_URL,
    vnpayLocale: environment.VNPAY_LOCALE,
    vnpayOrderType: environment.VNPAY_ORDER_TYPE,
    vnpayApiIpAddr: environment.VNPAY_API_IP_ADDR,
    sesEnabled: environment.SES_ENABLED,
    sesFromEmail: environment.SES_FROM_EMAIL,
    sesVerifiedRecipients: splitCsvEmails(environment.SES_VERIFIED_RECIPIENTS),
    sesConfigurationSetName: environment.SES_CONFIGURATION_SET_NAME,
  }))

export type AwsInfraEnv = z.infer<typeof awsInfraEnvSchema>

export function validateAwsInfraEnv(environment: Record<string, unknown>): AwsInfraEnv {
  return awsInfraEnvSchema.parse(environment)
}
