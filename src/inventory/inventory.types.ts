/**
 * InventoryItem — bản ghi tồn kho trong DynamoDB.
 *
 * Tại sao tách inventory ra table riêng thay vì thêm field `stock` vào products?
 * → Separation of concerns: product catalog (thông tin sản phẩm) vs inventory (số lượng).
 * → Trong production, inventory thường có write patterns khác (atomic updates, high concurrency).
 * → Dễ scale và grant permissions riêng cho các services khác nhau.
 */
export interface InventoryItem {
  /** PK — liên kết với products table */
  productId: string
  /** Số lượng tồn kho hiện tại (đã trừ reserved) */
  stock: number
  /**
   * Số lượng đang bị giữ bởi PENDING orders.
   * Khi order PENDING → stock bị trừ, reserved tăng lên.
   * Khi order CONFIRMED → reserved giảm xuống (stock đã trừ rồi).
   * Khi order CANCELLED → stock được hoàn lại, reserved giảm xuống.
   */
  reserved: number
  updatedAt: string
}
