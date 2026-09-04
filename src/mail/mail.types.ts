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
}
