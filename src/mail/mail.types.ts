import { Order, OrderItem } from '../orders/orders.types'

export interface SendOrderConfirmationEmailInput {
  order: Order
  items: OrderItem[]
}

export type OrderConfirmationEmailStatus = 'SENT' | 'SKIPPED' | 'FAILED'

export interface OrderConfirmationEmailResult {
  status: OrderConfirmationEmailStatus
  messageId?: string
  reason?: string
  recipientEmails?: string[]
}

export type EmailDeliveryStatus =
  'PENDING' | 'SENT' | 'DELIVERED' | 'BOUNCED' | 'COMPLAINED' | 'REJECTED' | 'FAILED' | 'SKIPPED'

export type EmailType = 'ORDER_CONFIRMATION' // WELCOME_EMAIL | ORDER_SHIPMENT | PASSWORD_RESET

export interface EmailTracking {
  emailId: string
  emailType: EmailType
  recipientEmail: string
  status: EmailDeliveryStatus // PENDING, SENT, DELIVERED, BOUNCED, COMPLAINED,...

  contextType: 'ORDER' // USER | ORDER | INVOICE | PAYMENT
  contextId: string // userId | orderId | invoiceId | paymentId
  contextKey: string

  sesMessageId?: string // The message ID returned by SES when the email is sent
  attemptNumber: number
  resendOfEmailId?: string

  bounceType?: 'Permanent' | 'Transient' | 'Undetermined'
  bounceSubType?: string

  complaintSubType?: string
  failureReason?: string

  configurationSetName?: string

  createdAt: string
  updatedAt: string
  sentAt?: string
  deliveredAt?: string
  bouncedAt?: string
  complainedAt?: string
  failedAt?: string
}
