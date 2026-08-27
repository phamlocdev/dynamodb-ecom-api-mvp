import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { commerceMapper } from '../dynamodb/commerce-table.mappers'
import { exitWithError, getScriptContext } from './script-helpers'
import { Category } from '../categories/category.types'
import { Product } from '../products/product.types'
import { InventoryRecord } from '../inventory/inventory.types'
import { Cart, CartItem } from '../carts/cart.types'
import { Order, OrderItem } from '../orders/orders.types'
import { UserProfile } from '../users/user.types'

async function main(): Promise<void> {
  const { documentClient, runtimeEnv } = getScriptContext()

  const categories = await scanAll<Category>(runtimeEnv.CATEGORIES_TABLE)
  const products = await scanAll<Product>(runtimeEnv.PRODUCTS_TABLE)
  const inventory = await scanAll<InventoryRecord>(runtimeEnv.INVENTORY_TABLE)
  const carts = await scanAll<Cart>(runtimeEnv.CARTS_TABLE)
  const cartItems = await scanAll<CartItem>(runtimeEnv.CART_ITEMS_TABLE)
  const orders = await scanAll<Order>(runtimeEnv.ORDERS_TABLE)
  const orderItems = await scanAll<OrderItem>(runtimeEnv.ORDER_ITEMS_TABLE)
  const profiles = await scanAll<UserProfile>(runtimeEnv.USER_PROFILES_TABLE)

  const productStatusById = new Map(
    products.map((product) => [product.productId, product.status] as const),
  )

  for (const category of categories) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toCategoryItem(category),
      }),
    )
  }

  for (const product of products) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toProductItem(product),
      }),
    )
  }

  for (const inventoryRecord of inventory) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toInventoryItem(
          inventoryRecord,
          productStatusById.get(inventoryRecord.productId),
        ),
      }),
    )
  }

  for (const cart of carts) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toCartRecord(cart),
      }),
    )
  }

  for (const item of cartItems) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toCartItemRecord(item),
      }),
    )
  }

  for (const order of orders) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toOrderRecord(order),
      }),
    )
  }

  for (const item of orderItems) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toOrderItemRecord(item),
      }),
    )
  }

  for (const profile of profiles) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toUserProfileRecord(profile),
      }),
    )
  }

  console.log(
    JSON.stringify(
      {
        categories: categories.length,
        products: products.length,
        inventory: inventory.length,
        carts: carts.length,
        cartItems: cartItems.length,
        orders: orders.length,
        orderItems: orderItems.length,
        profiles: profiles.length,
      },
      null,
      2,
    ),
  )
}

async function scanAll<TItem>(tableName: string): Promise<TItem[]> {
  const { documentClient } = getScriptContext()
  const items: TItem[] = []
  let lastEvaluatedKey: Record<string, unknown> | undefined

  do {
    const response = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    )
    items.push(...((response.Items ?? []) as TItem[]))
    lastEvaluatedKey = response.LastEvaluatedKey
  } while (lastEvaluatedKey)

  return items
}

void main().catch(exitWithError)
