import { COMMERCE_GSI_KEYS } from './commerce-table.constants'
import { SingleTableKeyFactory } from './commerce-table.types'

export const commerceKeys: SingleTableKeyFactory = {
  category(categoryId: string) {
    return { PK: `CATEGORY#${categoryId}`, SK: 'META' }
  },
  product(productId: string) {
    return { PK: `PRODUCT#${productId}`, SK: 'META' }
  },
  inventory(productId: string) {
    return { PK: `PRODUCT#${productId}`, SK: 'INVENTORY' }
  },
  cart(customerId: string, cartId: string) {
    return { PK: `CUSTOMER#${customerId}`, SK: `CART#${cartId}` }
  },
  cartItems(cartId: string) {
    return { PK: `CART#${cartId}`, SKPrefix: 'ITEM#' }
  },
  cartItem(cartId: string, productId: string) {
    return { PK: `CART#${cartId}`, SK: `ITEM#${productId}` }
  },
  order(orderId: string) {
    return { PK: `ORDER#${orderId}`, SK: 'META' }
  },
  orderItems(orderId: string) {
    return { PK: `ORDER#${orderId}`, SKPrefix: 'ITEM#' }
  },
  orderItem(orderId: string, lineId: string) {
    return { PK: `ORDER#${orderId}`, SK: `ITEM#${lineId}` }
  },
  userProfile(userId: string) {
    return { PK: `USER#${userId}`, SK: 'PROFILE' }
  },
}

export function buildProductListSortKey(
  status: string,
  categoryId: string,
  updatedAt: string,
  productId: string,
): string {
  return [status, categoryId, updatedAt, productId].join('#')
}

export function buildCustomerOrderSortKey(createdAt: string, orderId: string): string {
  return `ORDER#${createdAt}#${orderId}`
}

export function buildOrderStatusSortKey(createdAt: string, orderId: string): string {
  return `${createdAt}#${orderId}`
}

export function buildOrderPaymentStatusSortKey(paymentExpiresAt: number, orderId: string): string {
  return `${String(paymentExpiresAt).padStart(12, '0')}#${orderId}`
}

export function buildInventoryListSortKey(
  productStatus: string | undefined,
  productId: string,
): string {
  return `${productStatus ?? 'UNKNOWN'}#${productId}`
}

export function productListPartitionKey(): string {
  return COMMERCE_GSI_KEYS.PRODUCT_LIST_PK
}

export function inventoryListPartitionKey(): string {
  return COMMERCE_GSI_KEYS.INVENTORY_LIST_PK
}
