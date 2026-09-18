import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SecretsService } from '../secrets/secrets.service'
import {
  type IpnResponse,
  type QueryDrResponse,
  ProductCode,
  type RefundResponse,
  type ReturnQueryFromVNPay,
  type VerifyIpnCall,
  type VerifyReturnUrl,
  RefundTransactionType,
  VNPay,
  VnpLocale,
  dateFormat,
  getDateInGMT7,
} from 'vnpay'

export interface BuildOrderPaymentUrlInput {
  amount: number
  clientIp: string
  createDate: Date
  expireDate: Date
  orderId: string
  orderInfo: string
}

export interface QueryOrderPaymentInput {
  clientIp: string
  createDate: Date
  orderId: string
  orderInfo: string
  transactionDate: Date
  transactionNo: number
}

export interface RefundOrderPaymentInput extends QueryOrderPaymentInput {
  amount: number
  createBy: string
  refundReason: string
}

interface VnpaySecret {
  tmnCode: string
  secureSecret: string
}

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name)
  private readonly frontendPaymentReturnUrl: string
  private readonly locale: VnpLocale
  private readonly orderType: ProductCode
  private readonly apiIpAddress: string
  private readonly paymentEndpoint: string
  private readonly gatewayHost: string
  private readonly vnpaySecretName: string
  private gatewayClientPromise?: Promise<VNPay>

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(SecretsService)
    private readonly secretsService: SecretsService,
  ) {
    const paymentUrl = new URL(configService.getOrThrow<string>('VNPAY_PAYMENT_URL'))
    this.paymentEndpoint = paymentUrl.pathname.replace(/^\/+/, '')
    this.gatewayHost = paymentUrl.origin

    this.vnpaySecretName = configService.getOrThrow<string>('VNPAY_SECRET_NAME')
    this.frontendPaymentReturnUrl = resolveFrontendPaymentReturnUrl(
      configService.getOrThrow<string>('CLIENT_CORS_ORIGINS'),
    )
    this.locale = toVnpLocale(configService.getOrThrow<'vn' | 'en'>('VNPAY_LOCALE'))
    this.orderType = configService.getOrThrow<ProductCode>('VNPAY_ORDER_TYPE') as ProductCode
    this.apiIpAddress = configService.getOrThrow<string>('VNPAY_API_IP_ADDR')
  }

  async buildOrderPaymentUrl(input: BuildOrderPaymentUrlInput): Promise<string> {
    const gatewayClient = await this.getGatewayClient()

    return gatewayClient.buildPaymentUrl({
      vnp_Amount: input.amount,
      vnp_CreateDate: toVnpayDateNumber(input.createDate),
      vnp_ExpireDate: toVnpayDateNumber(input.expireDate),
      vnp_IpAddr: input.clientIp,
      vnp_Locale: this.locale,
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: this.orderType,
      vnp_ReturnUrl: this.frontendPaymentReturnUrl,
      vnp_TxnRef: input.orderId,
    })
  }

  async verifyReturnQuery(query: Record<string, string>): Promise<VerifyReturnUrl> {
    const gatewayClient = await this.getGatewayClient()
    return gatewayClient.verifyReturnUrl(query as ReturnQueryFromVNPay)
  }

  async verifyIpnQuery(query: Record<string, string>): Promise<VerifyIpnCall> {
    const gatewayClient = await this.getGatewayClient()
    return gatewayClient.verifyIpnCall(query as ReturnQueryFromVNPay)
  }

  async queryOrderPayment(input: QueryOrderPaymentInput): Promise<QueryDrResponse> {
    const gatewayClient = await this.getGatewayClient()

    return gatewayClient.queryDr({
      vnp_RequestId: buildGatewayRequestId(),
      vnp_CreateDate: toVnpayDateNumber(input.createDate),
      vnp_IpAddr: input.clientIp,
      vnp_OrderInfo: input.orderInfo,
      vnp_TransactionDate: toVnpayDateNumber(input.transactionDate),
      vnp_TransactionNo: input.transactionNo,
      vnp_TxnRef: input.orderId,
    })
  }

  async refundOrderPayment(input: RefundOrderPaymentInput): Promise<RefundResponse> {
    const gatewayClient = await this.getGatewayClient()

    return gatewayClient.refund({
      vnp_Amount: input.amount,
      vnp_CreateBy: input.createBy,
      vnp_CreateDate: toVnpayDateNumber(new Date()),
      vnp_IpAddr: input.clientIp,
      vnp_Locale: this.locale,
      vnp_OrderInfo: input.refundReason,
      vnp_RequestId: buildGatewayRequestId(),
      vnp_TransactionDate: toVnpayDateNumber(input.transactionDate),
      vnp_TransactionNo: input.transactionNo,
      vnp_TransactionType: RefundTransactionType.FULL_REFUND,
      vnp_TxnRef: input.orderId,
    })
  }

  getApiIpAddress(): string {
    return this.apiIpAddress
  }

  logIpnResponse(orderId: string, response: IpnResponse): void {
    this.logger.log(
      `VNPay IPN response for order ${orderId}: ${response.RspCode} ${response.Message}`,
    )
  }

  buildFrontendPaymentReturnUrl(
    query: Record<string, string>,
    options: { isVerified: boolean; message: string },
  ): string {
    const redirectUrl = new URL(this.frontendPaymentReturnUrl)

    for (const [key, value] of Object.entries(query)) {
      redirectUrl.searchParams.set(key, value)
    }

    redirectUrl.searchParams.set('verified', options.isVerified ? '1' : '0')
    redirectUrl.searchParams.set('returnMessage', options.message)

    return redirectUrl.toString()
  }

  private getGatewayClient(): Promise<VNPay> {
    this.gatewayClientPromise ??= this.createGatewayClient()
    return this.gatewayClientPromise
  }

  private async createGatewayClient(): Promise<VNPay> {
    const vnpaySecret = await this.getVnpaySecret()

    return new VNPay({
      tmnCode: vnpaySecret.tmnCode,
      secureSecret: vnpaySecret.secureSecret,
      vnpayHost: this.gatewayHost,
      queryDrAndRefundHost: this.gatewayHost,
      paymentEndpoint: this.paymentEndpoint,
      testMode: this.gatewayHost.includes('sandbox'),
      vnp_Locale: this.locale,
      vnp_OrderType: this.orderType,
    })
  }

  private async getVnpaySecret(): Promise<VnpaySecret> {
    const secretString = await this.secretsService.getSecretString(this.vnpaySecretName)
    let parsedSecret: unknown

    try {
      parsedSecret = JSON.parse(secretString)
    } catch (error) {
      this.logger.error(`VNPay secret ${this.vnpaySecretName} is not valid JSON.`)
      throw error
    }

    if (!isVnpaySecret(parsedSecret)) {
      throw new Error(
        `VNPay secret ${this.vnpaySecretName} must contain non-empty tmnCode and secureSecret fields.`,
      )
    }

    return parsedSecret
  }
}

export function toVnpayDateNumber(value: Date): number {
  return Number(dateFormat(getDateInGMT7(value)))
}

function toVnpLocale(value: 'vn' | 'en'): VnpLocale {
  return value === 'en' ? VnpLocale.EN : VnpLocale.VN
}

function buildGatewayRequestId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0')}`
}

function resolveFrontendPaymentReturnUrl(clientCorsOrigins: string): string {
  const origin =
    clientCorsOrigins
      .split(',')
      .map((item) => item.trim())
      .find(Boolean) ?? 'http://localhost:3000'

  return new URL('/orders/payment-return', origin).toString()
}

function isVnpaySecret(value: unknown): value is VnpaySecret {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tmnCode' in value &&
    'secureSecret' in value &&
    typeof value.tmnCode === 'string' &&
    value.tmnCode.length > 0 &&
    typeof value.secureSecret === 'string' &&
    value.secureSecret.length > 0
  )
}
