import { Category } from '../categories/category.types'
import { Cart, CartItem } from '../carts/cart.types'
import { InventoryRecord } from '../inventory/inventory.types'
import { Order, OrderItem } from '../orders/orders.types'
import { Product } from '../products/product.types'
import { UserProfile } from '../users/user.types'
import { COMMERCE_ENTITY_TYPES } from './commerce-table.constants'
import {
  buildCustomerOrderSortKey,
  buildInventoryListSortKey,
  buildOrderPaymentStatusSortKey,
  buildOrderStatusSortKey,
  buildProductListSortKey,
  commerceKeys,
  inventoryListPartitionKey,
  productListPartitionKey,
} from './commerce-table.keys'
import {
  CategoryItem,
  CartItemRecord,
  CartRecord,
  InventoryItem,
  OrderItemRecord,
  OrderRecord,
  ProductItem,
  SingleTableEntityMapper,
  UserProfileRecord,
} from './commerce-table.types'

export const commerceMapper: SingleTableEntityMapper = {
  toCategoryItem(category: Category): CategoryItem {
    return {
      ...commerceKeys.category(category.categoryId),
      entityType: COMMERCE_ENTITY_TYPES.CATEGORY,
      GSI1PK: 'CATEGORY',
      GSI1SK: category.categoryId,
      ...category,
    }
  },
  toProductItem(product: Product): ProductItem {
    return {
      ...commerceKeys.product(product.productId),
      entityType: COMMERCE_ENTITY_TYPES.PRODUCT,
      GSI1PK: productListPartitionKey(),
      GSI1SK: buildProductListSortKey(
        product.status,
        product.categoryId,
        product.updatedAt,
        product.productId,
      ),
      ...product,
    }
  },
  toInventoryItem(inventory: InventoryRecord, productStatus?: Product['status']): InventoryItem {
    return {
      ...commerceKeys.inventory(inventory.productId),
      entityType: COMMERCE_ENTITY_TYPES.INVENTORY,
      GSI6PK: inventoryListPartitionKey(),
      GSI6SK: buildInventoryListSortKey(productStatus, inventory.productId),
      productStatus,
      ...inventory,
    }
  },
  toCartRecord(cart: Cart): CartRecord {
    return {
      ...commerceKeys.cart(cart.customerId, cart.cartId),
      entityType: COMMERCE_ENTITY_TYPES.CART,
      ...cart,
    }
  },
  toCartItemRecord(item: CartItem): CartItemRecord {
    return {
      ...commerceKeys.cartItem(item.cartId, item.productId),
      entityType: COMMERCE_ENTITY_TYPES.CART_ITEM,
      ...item,
    }
  },
  toOrderRecord(order: Order): OrderRecord {
    return {
      ...order,
      ...commerceKeys.order(order.orderId),
      entityType: COMMERCE_ENTITY_TYPES.ORDER,
      GSI2PK: `CUSTOMER#${order.customerId}`,
      GSI2SK: buildCustomerOrderSortKey(order.createdAt, order.orderId),
      ...(order.status
        ? {
            GSI3PK: `ORDER_STATUS#${order.status}`,
            GSI3SK: buildOrderStatusSortKey(order.createdAt, order.orderId),
          }
        : {}),
      ...(order.customerEmail
        ? {
            GSI4PK: `CUSTOMER_EMAIL#${order.customerEmail}`,
            GSI4SK: buildOrderStatusSortKey(order.createdAt, order.orderId),
          }
        : {}),
      ...(order.paymentExpiresAt !== undefined
        ? {
            GSI5PK: `ORDER_PAYMENT_STATUS#${order.status}`,
            GSI5SK: buildOrderPaymentStatusSortKey(order.paymentExpiresAt, order.orderId),
          }
        : {}),
    }
  },
  toOrderItemRecord(item: OrderItem): OrderItemRecord {
    return {
      ...commerceKeys.orderItem(item.orderId, item.lineId),
      entityType: COMMERCE_ENTITY_TYPES.ORDER_ITEM,
      ...item,
    }
  },
  toUserProfileRecord(profile: UserProfile): UserProfileRecord {
    return {
      ...commerceKeys.userProfile(profile.userId),
      entityType: COMMERCE_ENTITY_TYPES.USER_PROFILE,
      ...profile,
    }
  },
}

export function fromCategoryItem(item: CategoryItem): Category {
  return {
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function fromProductItem(item: ProductItem): Product {
  return {
    productId: item.productId,
    name: item.name,
    description: item.description,
    categoryId: item.categoryId,
    price: item.price,
    currency: item.currency,
    imageUrl: item.imageUrl,
    images: item.images,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function fromInventoryItem(item: InventoryItem): InventoryRecord {
  return {
    productId: item.productId,
    availableQuantity: item.availableQuantity,
    reservedQuantity: item.reservedQuantity,
    updatedAt: item.updatedAt,
  }
}

export function fromCartRecord(item: CartRecord): Cart {
  return {
    customerId: item.customerId,
    cartId: item.cartId,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    expiresAt: item.expiresAt,
  }
}

export function fromCartItemRecord(item: CartItemRecord): CartItem {
  return {
    cartId: item.cartId,
    customerId: item.customerId,
    productId: item.productId,
    quantity: item.quantity,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function fromOrderRecord(item: OrderRecord): Order {
  return {
    orderId: item.orderId,
    customerId: item.customerId,
    customerEmail: item.customerEmail,
    customerName: item.customerName,
    cartId: item.cartId,
    status: item.status,
    entityType: item.entityType,
    deduplicationKey: item.deduplicationKey,
    paymentStatus: item.paymentStatus,
    paymentAttemptId: item.paymentAttemptId,
    paymentRequestedAt: item.paymentRequestedAt,
    paidAt: item.paidAt,
    paymentTransactionId: item.paymentTransactionId,
    paymentFailureReason: item.paymentFailureReason,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    reservedAt: item.reservedAt,
    paymentExpiresAt: item.paymentExpiresAt,
    failureReason: item.failureReason,
    totalAmount: item.totalAmount,
  }
}

export function fromOrderItemRecord(item: OrderItemRecord): OrderItem {
  return {
    orderId: item.orderId,
    lineId: item.lineId,
    productId: item.productId,
    productName: item.productName,
    imageUrl: item.imageUrl,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
    createdAt: item.createdAt,
  }
}

export function fromUserProfileRecord(item: UserProfileRecord): UserProfile {
  return {
    userId: item.userId,
    username: item.username,
    email: item.email,
    name: item.name,
    avatarKey: item.avatarKey,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}
