import { OrderStatus } from './order-status.enum'

/**
 * Order — bản ghi header trong DynamoDB orders table.
 * PK: orderId (String)
 */
export interface Order {
  orderId: string
  userId: string
  status: OrderStatus
  totalAmount: number
  currency: 'VND'
  /**
   * SQS MessageId trả về sau SendMessageCommand.
   * Dùng để reference/trace message trong SQS console hoặc logs.
   * Không dùng để DeleteMessage (cần sqsReceiptHandle cho việc đó).
   */
  sqsMessageId?: string
  /**
   * SQS ReceiptHandle — định danh duy nhất cho 1 "lần nhận" message.
   * Chỉ có giá trị khi message đang "in-flight" (consumer đang xử lý).
   * Dùng để DeleteMessage khi cancel order PENDING.
   *
   * Lưu ý: field này KHÔNG được lưu vào DB trong implementation này
   * vì ReceiptHandle chỉ được cấp khi consumer receive message, không phải khi producer gửi.
   * Cancel order PENDING được xử lý ở tầng application (check status trước khi process).
   */
  items: OrderItemSnapshot[]
  createdAt: string
  updatedAt: string
}

/**
 * Snapshot của cart item tại thời điểm đặt hàng.
 * Lưu trong Order record để tránh phụ thuộc vào products table (giá có thể thay đổi).
 */
export interface OrderItemSnapshot {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  currency: 'VND'
}

/**
 * OrderItem — bản ghi trong DynamoDB order-items table.
 * Composite PK: orderId (PK) + productId (SK)
 * Được tạo bởi Order Processor Lambda sau khi xử lý thành công.
 */
export interface OrderItem {
  orderId: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  currency: 'VND'
}

/**
 * Payload được serialize vào SQS MessageBody.
 * Order Processor Lambda sẽ parse JSON này để xử lý.
 */
export interface OrderQueuePayload {
  orderId: string
  userId: string
  items: OrderItemSnapshot[]
  totalAmount: number
}
