import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SESv2Client, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-sesv2'
import Handlebars from 'handlebars'
import { promises as fs } from 'fs'
import * as path from 'path'
import { OrderConfirmationEmailResult, SendOrderConfirmationEmailInput } from './mail.types'

const ORDER_CONFIRMATION_TEMPLATE_FILE = 'order-confirmation.hbs'

interface OrderConfirmationTemplateItemView {
  productName: string
  quantity: number
  unitPrice: string
  lineTotal: string
}

interface OrderConfirmationTemplateView {
  customerName: string
  orderId: string
  paidAt: string
  paymentTransactionId: string
  totalAmount: string
  items: OrderConfirmationTemplateItemView[]
}

@Injectable()
export class SesMailService {
  private readonly logger = new Logger(SesMailService.name)
  private readonly sesClient: SESv2Client
  private readonly isEnabled: boolean
  private readonly fromEmail?: string
  private readonly verifiedRecipients: Set<string>
  private readonly orderConfirmationSubject: string
  private orderConfirmationTemplatePromise?: Promise<
    Handlebars.TemplateDelegate<OrderConfirmationTemplateView>
  >

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'

    this.sesClient = new SESv2Client({ region })
    this.isEnabled = configService.get<boolean>('SES_ENABLED') ?? false
    this.fromEmail = configService.get<string>('SES_FROM_EMAIL') ?? undefined
    this.orderConfirmationSubject =
      configService.get<string>('SES_ORDER_CONFIRMATION_SUBJECT') ?? 'Xac nhan don hang cua ban'
    this.verifiedRecipients = new Set(
      (configService.get<string[]>('SES_VERIFIED_RECIPIENTS') ?? []).map((email) =>
        email.toLowerCase(),
      ),
    )
  }

  async sendOrderConfirmationEmail(
    input: SendOrderConfirmationEmailInput,
  ): Promise<OrderConfirmationEmailResult> {
    const recipientEmail = input.order.customerEmail?.trim().toLowerCase()

    if (!this.isEnabled) {
      return {
        status: 'SKIPPED',
        reason: 'ses-disabled',
      }
    }

    if (!this.fromEmail) {
      return {
        status: 'SKIPPED',
        reason: 'missing-from-email',
      }
    }

    if (!recipientEmail) {
      return {
        status: 'SKIPPED',
        reason: 'missing-customer-email',
      }
    }

    // if (!this.verifiedRecipients.has(recipientEmail)) {
    //   return {
    //     status: 'SKIPPED',
    //     reason: 'recipient-not-verified',
    //   }
    // }

    try {
      const template = await this.getOrderConfirmationTemplate()
      const html = template(buildOrderConfirmationTemplateView(input))

      const commandInput: SendEmailCommandInput = {
        FromEmailAddress: this.fromEmail,
        Destination: {
          ToAddresses: [recipientEmail],
        },
        Content: {
          Simple: {
            Subject: {
              Data: this.orderConfirmationSubject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: html,
                Charset: 'UTF-8',
              },
            },
          },
        },
      }

      const response = await this.sesClient.send(new SendEmailCommand(commandInput))
      return {
        status: 'SENT',
        messageId: response.MessageId,
      }
    } catch (error) {
      this.logger.error(
        `Failed to send order confirmation email for order ${input.order.orderId}.`,
        error,
      )

      return {
        status: 'FAILED',
        reason: error instanceof Error ? error.message : 'ses-send-failed',
      }
    }
  }

  private async getOrderConfirmationTemplate(): Promise<
    Handlebars.TemplateDelegate<OrderConfirmationTemplateView>
  > {
    this.orderConfirmationTemplatePromise ??= this.loadOrderConfirmationTemplate()
    return this.orderConfirmationTemplatePromise
  }

  private async loadOrderConfirmationTemplate(): Promise<
    Handlebars.TemplateDelegate<OrderConfirmationTemplateView>
  > {
    const templateSource = await this.readTemplateFile(ORDER_CONFIRMATION_TEMPLATE_FILE)
    return Handlebars.compile<OrderConfirmationTemplateView>(templateSource)
  }

  private async readTemplateFile(templateFileName: string): Promise<string> {
    const candidatePaths = [
      path.resolve(__dirname, 'templates', templateFileName),
      path.resolve(__dirname, 'templates', 'mail', 'templates', templateFileName),
    ]

    for (const candidatePath of candidatePaths) {
      try {
        return await fs.readFile(candidatePath, 'utf8')
      } catch (error) {
        if (isMissingFileError(error)) {
          continue
        }

        throw error
      }
    }

    throw new Error(`Email template ${templateFileName} was not found in the Lambda artifact.`)
  }
}

function buildOrderConfirmationTemplateView(
  input: SendOrderConfirmationEmailInput,
): OrderConfirmationTemplateView {
  const paidAt = input.order.paidAt ? formatOrderTimestamp(input.order.paidAt) : 'N/A'

  return {
    customerName: input.order.customerName?.trim() || 'ban',
    orderId: input.order.orderId,
    paidAt,
    paymentTransactionId: input.order.paymentTransactionId ?? 'N/A',
    totalAmount: formatCurrency(input.order.totalAmount ?? 0),
    items: input.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: formatCurrency(item.unitPrice),
      lineTotal: formatCurrency(item.lineTotal),
    })),
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatOrderTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(timestamp))
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
