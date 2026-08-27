import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { exitWithError, getScriptContext } from './script-helpers'
import { InventoryRecord } from '../inventory/inventory.types'

async function main(): Promise<void> {
  const { documentClient, runtimeEnv } = getScriptContext()

  const [
    legacyProducts,
    legacyCategories,
    legacyOrders,
    legacyOrderItems,
    legacyCartItems,
    legacyProfiles,
    legacyInventory,
    commerceItems,
  ] = await Promise.all([
    countTable(runtimeEnv.PRODUCTS_TABLE),
    countTable(runtimeEnv.CATEGORIES_TABLE),
    countTable(runtimeEnv.ORDERS_TABLE),
    countTable(runtimeEnv.ORDER_ITEMS_TABLE),
    countTable(runtimeEnv.CART_ITEMS_TABLE),
    countTable(runtimeEnv.USER_PROFILES_TABLE),
    scanAll<InventoryRecord>(runtimeEnv.INVENTORY_TABLE),
    scanAll<Record<string, unknown>>(runtimeEnv.ECOMMERCE_TABLE),
  ])

  const entityCounts = commerceItems.reduce<Record<string, number>>((result, item) => {
    const entityType = String(item.entityType ?? 'UNKNOWN')
    result[entityType] = (result[entityType] ?? 0) + 1
    return result
  }, {})

  const orphanOrderItems = await findOrphanOrderItems(runtimeEnv.ECOMMERCE_TABLE)
  const orphanCartItems = await findOrphanCartItems(runtimeEnv.ECOMMERCE_TABLE)
  const orphanInventory = await findOrphanInventory(runtimeEnv.ECOMMERCE_TABLE)

  console.log(
    JSON.stringify(
      {
        legacyCounts: {
          products: legacyProducts,
          categories: legacyCategories,
          orders: legacyOrders,
          orderItems: legacyOrderItems,
          cartItems: legacyCartItems,
          userProfiles: legacyProfiles,
          inventory: legacyInventory.length,
        },
        commerceEntityCounts: entityCounts,
        inventoryTotals: legacyInventory.reduce(
          (result, item) => ({
            availableQuantity: result.availableQuantity + item.availableQuantity,
            reservedQuantity: result.reservedQuantity + item.reservedQuantity,
          }),
          { availableQuantity: 0, reservedQuantity: 0 },
        ),
        orphanOrderItems,
        orphanCartItems,
        orphanInventory,
      },
      null,
      2,
    ),
  )
}

async function countTable(tableName: string): Promise<number> {
  return (await scanAll<Record<string, unknown>>(tableName)).length
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

async function findOrphanOrderItems(tableName: string): Promise<string[]> {
  const { documentClient } = getScriptContext()
  const items = await scanAll<Record<string, unknown>>(tableName)
  const orderItems = items.filter(
    (item) =>
      String(item.entityType ?? '') === 'ORDER_ITEM' &&
      String(item.PK ?? '').startsWith('ORDER#') &&
      String(item.SK ?? '').startsWith('ITEM#'),
  )

  const orphanIds: string[] = []
  for (const item of orderItems) {
    const orderId = String(item.orderId ?? '')
    if (!orderId) {
      orphanIds.push(String(item.SK ?? 'unknown'))
      continue
    }

    const order = await documentClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `ORDER#${orderId}`, SK: 'META' },
      }),
    )
    if (!order.Item) {
      orphanIds.push(String(item.SK ?? orderId))
    }
  }

  return orphanIds
}

async function findOrphanCartItems(tableName: string): Promise<string[]> {
  const items = await scanAll<Record<string, unknown>>(tableName)
  const carts = new Set(
    items
      .filter((item) => item.entityType === 'CART')
      .map((item) => String(item.SK ?? '').replace('CART#', '')),
  )

  return items
    .filter((item) => item.entityType === 'CART_ITEM')
    .map((item) => ({
      cartId: String(item.cartId ?? ''),
      sk: String(item.SK ?? ''),
    }))
    .filter((item) => !carts.has(item.cartId))
    .map((item) => item.sk)
}

async function findOrphanInventory(tableName: string): Promise<string[]> {
  const items = await scanAll<Record<string, unknown>>(tableName)
  const products = new Set(
    items
      .filter((item) => item.entityType === 'PRODUCT')
      .map((item) => String(item.productId ?? '')),
  )

  return items
    .filter((item) => item.entityType === 'INVENTORY')
    .map((item) => String(item.productId ?? ''))
    .filter((productId) => !products.has(productId))
}

void main().catch(exitWithError)
