import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SESv2Client, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-sesv2'
import Handlebars from 'handlebars'
import { promises as fs } from 'fs'
import * as path from 'path'
import { EmailTrackingService } from './email-tracking.service'
import {
  EmailContextType,
  EmailSendResult,
  EmailType,
  SendOrderConfirmationEmailInput,
  SendShippedOrderNotificationEmailInput,
  SendWelcomeNewCustomerEmailInput,
} from './mail.types'

const TEMPLATE_FILES: Record<EmailType, string> = {
  ORDER_CONFIRMATION: 'order-confirmation.hbs',
  WELCOME_NEW_CUSTOMER: 'welcome-new-customer.hbs',
  SHIPPED_ORDER_NOTIFICATION: 'shipped-order-notification.hbs',
}
const EMAIL_SUBJECTS: Record<EmailType, string> = {
  ORDER_CONFIRMATION: 'Xac nhan don hang cua ban',
  WELCOME_NEW_CUSTOMER: 'Chao mung ban den voi DynamoDB MVP',
  SHIPPED_ORDER_NOTIFICATION: 'Don hang cua ban da duoc van chuyen',
}

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

interface ShippedOrderNotificationTemplateView {
  customerName: string
  orderId: string
  shippedAt: string
  totalAmount: string
  items: OrderConfirmationTemplateItemView[]
}

interface WelcomeNewCustomerTemplateView {
  customerName: string
  username: string
  email: string
}

type MailTemplateView =
  | OrderConfirmationTemplateView
  | ShippedOrderNotificationTemplateView
  | WelcomeNewCustomerTemplateView

@Injectable()
export class SesMailService {
  private readonly logger = new Logger(SesMailService.name)
  private readonly sesClient: SESv2Client
  private readonly isEnabled: boolean
  private readonly fromEmail?: string
  private readonly orderConfirmationSubject: string
  private readonly welcomeNewCustomerSubject: string
  private readonly shippedOrderNotificationSubject: string
  private readonly configurationSetName?: string
  private readonly templatePromises = new Map<
    EmailType,
    Promise<Handlebars.TemplateDelegate<MailTemplateView>>
  >()

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
    this.orderConfirmationSubject = EMAIL_SUBJECTS.ORDER_CONFIRMATION
    this.welcomeNewCustomerSubject = EMAIL_SUBJECTS.WELCOME_NEW_CUSTOMER
    this.shippedOrderNotificationSubject = EMAIL_SUBJECTS.SHIPPED_ORDER_NOTIFICATION
    this.configurationSetName = configService.get<string>('SES_CONFIGURATION_SET_NAME') ?? undefined
  }

  async sendOrderConfirmationEmail(
    input: SendOrderConfirmationEmailInput,
  ): Promise<EmailSendResult> {
    const recipientEmails = resolveRecipientEmails(
      input.order.customerEmail,
      input.order.additionalReceivingEmails,
      input.recipientEmails,
    )

    return this.sendTemplatedEmail({
      emailType: 'ORDER_CONFIRMATION',
      contextType: 'ORDER',
      contextId: input.order.orderId,
      recipientEmails,
      subject: this.orderConfirmationSubject,
      templateView: buildOrderConfirmationTemplateView(input),
      resendOfByRecipient: resolveResendOfByRecipient(input, recipientEmails),
    })
  }

  async sendShippedOrderNotificationEmail(
    input: SendShippedOrderNotificationEmailInput,
  ): Promise<EmailSendResult> {
    const recipientEmails = resolveRecipientEmails(
      input.order.customerEmail,
      input.order.additionalReceivingEmails,
      input.recipientEmails,
    )

    return this.sendTemplatedEmail({
      emailType: 'SHIPPED_ORDER_NOTIFICATION',
      contextType: 'ORDER',
      contextId: input.order.orderId,
      recipientEmails,
      subject: this.shippedOrderNotificationSubject,
      templateView: buildShippedOrderNotificationTemplateView(input),
      resendOfByRecipient: resolveResendOfByRecipient(input, recipientEmails),
    })
  }

  async sendWelcomeNewCustomerEmail(
    input: SendWelcomeNewCustomerEmailInput,
  ): Promise<EmailSendResult> {
    const contextId = input.user.sub ?? input.user.username
    return this.sendTemplatedEmail({
      emailType: 'WELCOME_NEW_CUSTOMER',
      contextType: 'USER',
      contextId,
      recipientEmails: resolveRecipientEmails(input.user.email, undefined, input.recipientEmails),
      subject: this.welcomeNewCustomerSubject,
      templateView: buildWelcomeNewCustomerTemplateView(input),
      resendOfByRecipient: input.resendOfByRecipient,
    })
  }

  private async sendTemplatedEmail(input: {
    emailType: EmailType
    contextType: EmailContextType
    contextId: string
    recipientEmails: string[]
    subject: string
    templateView: MailTemplateView
    resendOfByRecipient?: Record<string, string>
  }): Promise<EmailSendResult> {
    if (!this.isEnabled) {
      await this.createSkippedTrackingItems(input, 'ses-disabled')
      return {
        status: 'SKIPPED',
        reason: 'ses-disabled',
        recipientEmails: input.recipientEmails,
      }
    }

    if (!this.fromEmail) {
      await this.createSkippedTrackingItems(input, 'missing-from-email')
      return {
        status: 'SKIPPED',
        reason: 'missing-from-email',
        recipientEmails: input.recipientEmails,
      }
    }

    if (input.recipientEmails.length === 0) {
      this.emailTrackingService.logTrackingSkipped(input.contextId, 'missing-recipient-email')
      return {
        status: 'SKIPPED',
        reason: 'missing-recipient-email',
        recipientEmails: input.recipientEmails,
      }
    }

    let trackingEmailIds: string[] = []

    try {
      const trackingItems = await this.emailTrackingService.createTrackingItems({
        emailType: input.emailType,
        contextType: input.contextType,
        contextId: input.contextId,
        recipientEmails: input.recipientEmails,
        status: 'PENDING',
        configurationSetName: this.configurationSetName,
        resendOfByRecipient: input.resendOfByRecipient,
      })
      trackingEmailIds = trackingItems.map((item) => item.emailId)

      const template = await this.getTemplate(input.emailType)
      const html = template(input.templateView)

      const commandInput: SendEmailCommandInput = {
        FromEmailAddress: this.fromEmail,
        Destination: {
          ToAddresses: input.recipientEmails,
        },
        ...(this.configurationSetName ? { ConfigurationSetName: this.configurationSetName } : {}),
        Content: {
          Simple: {
            Subject: {
              Data: input.subject,
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
          `Failed to mark ${input.emailType} tracking as sent for ${input.contextId}.`,
          error,
        )
      }

      return {
        status: 'SENT',
        messageId: response.MessageId,
        recipientEmails: input.recipientEmails,
      }
    } catch (error) {
      this.logger.error(`Failed to send ${input.emailType} for ${input.contextId}.`, error)

      const failureReason = error instanceof Error ? error.message : 'ses-send-failed'
      if (trackingEmailIds.length > 0) {
        await this.emailTrackingService.markFailed(trackingEmailIds, failureReason)
      }

      return {
        status: 'FAILED',
        reason: failureReason,
        recipientEmails: input.recipientEmails,
      }
    }
  }

  private async createSkippedTrackingItems(
    input: {
      emailType: EmailType
      contextType: EmailContextType
      contextId: string
      recipientEmails: string[]
      resendOfByRecipient?: Record<string, string>
    },
    reason: string,
  ): Promise<void> {
    if (input.recipientEmails.length === 0) {
      this.emailTrackingService.logTrackingSkipped(input.contextId, reason)
      return
    }

    await this.emailTrackingService.createTrackingItems({
      emailType: input.emailType,
      contextType: input.contextType,
      contextId: input.contextId,
      recipientEmails: input.recipientEmails,
      status: 'SKIPPED',
      configurationSetName: this.configurationSetName,
      failureReason: reason,
      resendOfByRecipient: input.resendOfByRecipient,
    })
  }

  private async getTemplate(
    emailType: EmailType,
  ): Promise<Handlebars.TemplateDelegate<MailTemplateView>> {
    const existingPromise = this.templatePromises.get(emailType)
    if (existingPromise) {
      return existingPromise
    }

    const promise = this.loadTemplate(emailType)
    this.templatePromises.set(emailType, promise)
    return promise
  }

  private async loadTemplate(
    emailType: EmailType,
  ): Promise<Handlebars.TemplateDelegate<MailTemplateView>> {
    const templateSource = await this.readTemplateFile(TEMPLATE_FILES[emailType])
    return Handlebars.compile<MailTemplateView>(templateSource)
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
    items: buildOrderItemTemplateViews(input.items),
  }
}

function buildShippedOrderNotificationTemplateView(
  input: SendShippedOrderNotificationEmailInput,
): ShippedOrderNotificationTemplateView {
  return {
    customerName: input.order.customerName?.trim() || 'ban',
    orderId: input.order.orderId,
    shippedAt: formatOrderTimestamp(input.shippedAt),
    totalAmount: formatCurrency(input.order.totalAmount ?? 0),
    items: buildOrderItemTemplateViews(input.items),
  }
}

function buildWelcomeNewCustomerTemplateView(
  input: SendWelcomeNewCustomerEmailInput,
): WelcomeNewCustomerTemplateView {
  return {
    customerName: input.user.name?.trim() || input.user.username || 'ban',
    username: input.user.username,
    email: input.user.email ?? 'N/A',
  }
}

function buildOrderItemTemplateViews(items: SendOrderConfirmationEmailInput['items']) {
  return items.map((item) => ({
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: formatCurrency(item.unitPrice),
    lineTotal: formatCurrency(item.lineTotal),
  }))
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
  overrideRecipientEmails?: string[],
): string[] {
  const recipients = overrideRecipientEmails ?? [
    customerEmail,
    ...(additionalReceivingEmails ?? []),
  ]

  return Array.from(
    new Set(
      recipients
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  )
}

function resolveResendOfByRecipient(
  input: { resendOfEmailId?: string; resendOfByRecipient?: Record<string, string> },
  recipientEmails: string[],
): Record<string, string> | undefined {
  if (input.resendOfByRecipient) {
    return input.resendOfByRecipient
  }

  if (!input.resendOfEmailId || recipientEmails.length !== 1) {
    return undefined
  }

  return {
    [recipientEmails[0]]: input.resendOfEmailId,
  }
}
