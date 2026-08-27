import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { buildSeedCategories, buildSeedProducts, getInventoryQuantity } from './catalog-seed-data'
import { commerceMapper } from '../dynamodb/commerce-table.mappers'
import { exitWithError, getScriptContext, nowIso } from './script-helpers'

export async function seedCatalog(): Promise<void> {
  const { documentClient, runtimeEnv } = getScriptContext()
  const timestamp = nowIso()
  const categories = buildSeedCategories()
  const products = buildSeedProducts()

  for (const category of categories) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.CATEGORIES_TABLE,
        Item: {
          ...category,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    )
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toCategoryItem({
          ...category,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      }),
    )
  }

  for (const [index, product] of products.entries()) {
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.PRODUCTS_TABLE,
        Item: {
          productId: product.productId,
          categoryId: product.categoryId,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency,
          status: product.status,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    )
    const productRecord = {
      productId: product.productId,
      categoryId: product.categoryId,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      status: product.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as const
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toProductItem(productRecord),
      }),
    )

    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.INVENTORY_TABLE,
        Item: {
          productId: product.productId,
          availableQuantity: getInventoryQuantity(index),
          reservedQuantity: 0,
          updatedAt: timestamp,
        },
      }),
    )
    await documentClient.send(
      new PutCommand({
        TableName: runtimeEnv.ECOMMERCE_TABLE,
        Item: commerceMapper.toInventoryItem(
          {
            productId: product.productId,
            availableQuantity: getInventoryQuantity(index),
            reservedQuantity: 0,
            updatedAt: timestamp,
          },
          product.status,
        ),
      }),
    )
  }

  console.log(
    `Seeded catalog successfully: categories=${categories.length}, products=${products.length}, inventories=${products.length}.`,
  )
}

async function main(): Promise<void> {
  await seedCatalog()
}

if (require.main === module) {
  void main().catch(exitWithError)
}
