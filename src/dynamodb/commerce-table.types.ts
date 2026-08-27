import { Category } from '../categories/category.types'
import { Cart, CartItem } from '../carts/cart.types'
import { InventoryRecord } from '../inventory/inventory.types'
import { Order, OrderItem } from '../orders/orders.types'
import { Product } from '../products/product.types'
import { UserProfile } from '../users/user.types'

export interface CommerceTableItem {
  PK: string
  SK: string
  entityType: string
  GSI1PK?: string
  GSI1SK?: string
  GSI2PK?: string
  GSI2SK?: string
  GSI3PK?: string
  GSI3SK?: string
  GSI4PK?: string
  GSI4SK?: string
  GSI5PK?: string
  GSI5SK?: string
  GSI6PK?: string
  GSI6SK?: string
}

export interface CategoryItem extends CommerceTableItem, Category {}
export interface ProductItem extends CommerceTableItem, Product {}
export interface InventoryItem extends CommerceTableItem, InventoryRecord {
  productStatus?: Product['status']
}
export interface CartItemRecord extends CommerceTableItem, CartItem {}
export interface CartRecord extends CommerceTableItem, Cart {}
export interface OrderRecord extends CommerceTableItem, Order {}
export interface OrderItemRecord extends CommerceTableItem, OrderItem {}
export interface UserProfileRecord extends CommerceTableItem, UserProfile {}

export interface SingleTableKeyFactory {
  category(categoryId: string): { PK: string; SK: string }
  product(productId: string): { PK: string; SK: string }
  inventory(productId: string): { PK: string; SK: string }
  cart(customerId: string, cartId: string): { PK: string; SK: string }
  cartItems(cartId: string): { PK: string; SKPrefix: string }
  cartItem(cartId: string, productId: string): { PK: string; SK: string }
  order(orderId: string): { PK: string; SK: string }
  orderItems(orderId: string): { PK: string; SKPrefix: string }
  orderItem(orderId: string, lineId: string): { PK: string; SK: string }
  userProfile(userId: string): { PK: string; SK: string }
}

export interface SingleTableEntityMapper {
  toCategoryItem(category: Category): CategoryItem
  toProductItem(product: Product): ProductItem
  toInventoryItem(inventory: InventoryRecord, productStatus?: Product['status']): InventoryItem
  toCartRecord(cart: Cart): CartRecord
  toCartItemRecord(item: CartItem): CartItemRecord
  toOrderRecord(order: Order): OrderRecord
  toOrderItemRecord(item: OrderItem): OrderItemRecord
  toUserProfileRecord(profile: UserProfile): UserProfileRecord
}
