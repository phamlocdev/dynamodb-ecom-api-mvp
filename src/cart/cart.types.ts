/**
 * CartItem — đại diện cho 1 dòng trong DynamoDB carts table.
 *
 * DynamoDB Design:
 * - PK: userId (String) — partition key
 * - SK: productId (String) — sort key
 * - Mỗi item trong cart = 1 dòng DynamoDB
 * - Query cart của user: KeyConditionExpression "userId = :uid"
 *
 * Tại sao không dùng 2 bảng (carts + cart_items)?
 * → Single-table design: với DynamoDB, thường gom data access pattern vào ít bảng nhất.
 * → Cart + cart items luôn được query cùng nhau → composite PK là optimal.
 */
export interface CartItem {
  /** PK — Cognito sub (userId) */
  userId: string
  /** SK — product reference */
  productId: string
  /** Số lượng trong cart */
  quantity: number
  /** Timestamp khi thêm vào cart */
  addedAt: string
}
