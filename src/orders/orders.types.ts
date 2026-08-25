import { OrderStatus } from './order-status.enum'
import { PaymentStatus } from './payment-status.enum'

export interface Order {
  orderId: string
  customerId: string
  customerEmail?: string
  customerName?: string
  cartId: string
  status: OrderStatus
  entityType: string
  deduplicationKey: string
  paymentStatus: PaymentStatus
  paymentAttemptId?: string
  paymentRequestedAt?: string
  paidAt?: string
  paymentTransactionId?: string
  paymentFailureReason?: string
  createdAt: string
  updatedAt: string
  reservedAt?: string
  paymentExpiresAt?: number
  failureReason?: string
  totalAmount?: number
}

export interface TriggerPaymentResult {
  orderId: string
  paymentStatus: PaymentStatus
  paymentUrl: string
  paymentExpiresAt?: number
}

export interface VnpayReturnResult {
  redirectUrl: string
}

export interface OrderItem {
  orderId: string
  lineId: string
  productId: string
  productName: string
  imageUrl?: string
  unitPrice: number
  quantity: number
  lineTotal: number
  createdAt: string
}

export interface OrderDetails extends Order {
  items: OrderItem[]
}

export interface PlaceOrderMessage {
  orderId: string
  customerId: string
  cartId: string
  deduplicationKey: string
  requestedAt: string
}
