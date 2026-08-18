/**
 * OrderStatus — lifecycle của một đơn hàng.
 *
 * Flow chuẩn:
 *   PENDING → CONFIRMED → PROCESSING → DELIVERED
 *
 * PENDING:    Order đã được tạo và message đã được enqueue vào SQS.
 *             Lúc này order CHƯA được xử lý — processor Lambda chưa pick up.
 *             → Đây là trạng thái duy nhất có thể cancel (DeleteMessage khỏi SQS).
 *
 * CONFIRMED:  Order Processor Lambda đã xử lý thành công:
 *             stock đã được confirm trừ, order items đã được tạo.
 *
 * PROCESSING: Admin/Manager cập nhật thủ công — đang chuẩn bị hàng/giao hàng.
 *
 * DELIVERED:  Đã giao hàng thành công (manual update).
 *
 * CANCELLED:  Đã bị cancel. Nếu cancel từ PENDING → stock được hoàn lại.
 *
 * FAILED:     Processor Lambda thất bại sau maxReceiveCount lần retry (mặc định 3).
 *             Message đã được move sang DLQ để observe.
 *             Stock cũng được hoàn lại trong trường hợp này.
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}
