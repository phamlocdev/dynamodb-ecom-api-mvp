import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SESv2Client, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-sesv2'
import Handlebars from 'handlebars'
import { promises as fs } from 'fs'
import * as path from 'path'
import { EmailTrackingService } from './email-tracking.service'
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
  private readonly configurationSetName?: string
  private orderConfirmationTemplatePromise?: Promise<
    Handlebars.TemplateDelegate<OrderConfirmationTemplateView>
  >

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(EmailTrackingService)
    private readonly emailTrackingService: EmailTrackingService,
  ) {
    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'

    this.sesClient = new SESv2Client({ region })
    this.isEnabled = configService.get<boolean>('SES_ENABLED') ?? false
    this.fromEmail = configService.get<string>('SES_FROM_EMAIL') ?? undefined
    this.orderConfirmationSubject =
      configService.get<string>('SES_ORDER_CONFIRMATION_SUBJECT') ?? 'Xac nhan don hang cua ban'
    this.configurationSetName = configService.get<string>('SES_CONFIGURATION_SET_NAME') ?? undefined
    this.verifiedRecipients = new Set(
      (configService.get<string[]>('SES_VERIFIED_RECIPIENTS') ?? []).map((email) =>
        email.toLowerCase(),
      ),
    )
  }

  async sendOrderConfirmationEmail(
    input: SendOrderConfirmationEmailInput,
  ): Promise<OrderConfirmationEmailResult> {
    const recipientEmails = resolveRecipientEmails(
      input.order.customerEmail,
      input.order.additionalReceivingEmails,
    )

    if (!this.isEnabled) {
      await this.createSkippedTrackingItems(input.order.orderId, recipientEmails, 'ses-disabled')
      return {
        status: 'SKIPPED',
        reason: 'ses-disabled',
        recipientEmails,
      }
    }

    if (!this.fromEmail) {
      await this.createSkippedTrackingItems(input.order.orderId, recipientEmails, 'missing-from-email')
      return {
        status: 'SKIPPED',
        reason: 'missing-from-email',
        recipientEmails,
      }
    }

    if (recipientEmails.length === 0) {
      this.emailTrackingService.logTrackingSkipped(input.order.orderId, 'missing-recipient-email')
      return {
        status: 'SKIPPED',
        reason: 'missing-recipient-email',
        recipientEmails,
      }
    }

    let trackingEmailIds: string[] = []

    try {
      const trackingItems = await this.emailTrackingService.createOrderConfirmationTrackingItems({
        orderId: input.order.orderId,
        recipientEmails,
        status: 'PENDING',
        configurationSetName: this.configurationSetName,
      })
      trackingEmailIds = trackingItems.map((item) => item.emailId)

      const template = await this.getOrderConfirmationTemplate()
      const html = template(buildOrderConfirmationTemplateView(input))

      const commandInput: SendEmailCommandInput = {
        FromEmailAddress: this.fromEmail,
        Destination: {
          ToAddresses: recipientEmails,
        },
        ...(this.configurationSetName
          ? { ConfigurationSetName: this.configurationSetName }
          : {}),
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
      try {
        await this.emailTrackingService.markSent(trackingEmailIds, response.MessageId)
      } catch (error) {
        this.logger.error(
          `Failed to mark order confirmation email tracking as sent for order ${input.order.orderId}.`,
          error,
        )
      }

      return {
        status: 'SENT',
        messageId: response.MessageId,
        recipientEmails,
      }
    } catch (error) {
      this.logger.error(
        `Failed to send order confirmation email for order ${input.order.orderId}.`,
        error,
      )

      const failureReason = error instanceof Error ? error.message : 'ses-send-failed'
      if (trackingEmailIds.length > 0) {
        await this.emailTrackingService.markFailed(trackingEmailIds, failureReason)
      }

      return {
        status: 'FAILED',
        reason: failureReason,
        recipientEmails,
      }
    }
  }

  private async createSkippedTrackingItems(
    orderId: string,
    recipientEmails: string[],
    reason: string,
  ): Promise<void> {
    if (recipientEmails.length === 0) {
      this.emailTrackingService.logTrackingSkipped(orderId, reason)
      return
    }

    await this.emailTrackingService.createOrderConfirmationTrackingItems({
      orderId,
      recipientEmails,
      status: 'SKIPPED',
      configurationSetName: this.configurationSetName,
      failureReason: reason,
    })
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

function resolveRecipientEmails(
  customerEmail: string | undefined,
  additionalReceivingEmails: string[] | undefined,
): string[] {
  const recipients = [customerEmail, ...(additionalReceivingEmails ?? [])]
    .map((email) => email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email))

  return Array.from(new Set(recipients))
}
