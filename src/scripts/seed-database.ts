import 'dotenv/config'
import { BatchWriteCommand, BatchWriteCommandInput, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { createDynamoDbDocumentClient } from '../dynamodb/dynamodb.config'
import { Category } from '../categories/category.types'
import { InventoryRecord } from '../inventory/inventory.types'
import { ProductStatus } from '../products/product-status.enum'
import { Product } from '../products/product.types'

const BATCH_WRITE_SIZE = 25
const seedTimestamp = '2026-08-12T00:00:00.000Z'

type SeedItem = object

interface TableSeed<TItem extends SeedItem> {
  tableName: string
  keyName: string
  createItems: () => TItem[]
}

const categoriesTableName = process.env.CATEGORIES_TABLE ?? 'categories'
const productsTableName = process.env.PRODUCTS_TABLE ?? 'products'
const inventoryTableName = process.env.INVENTORY_TABLE ?? 'inventory'

const categorySeeds = createSeedCategories()
const productSeeds = createSeedProducts(categorySeeds)

const tableSeeds: TableSeed<SeedItem>[] = [
  {
    tableName: categoriesTableName,
    keyName: 'categoryId',
    createItems: () => categorySeeds,
  },
  {
    tableName: productsTableName,
    keyName: 'productId',
    createItems: () => productSeeds,
  },
  {
    tableName: inventoryTableName,
    keyName: 'productId',
    createItems: () => createSeedInventory(productSeeds),
  },
]

async function main(): Promise<void> {
  const client = createDynamoDbDocumentClient()

  for (const seed of tableSeeds) {
    const items = seed.createItems()
    const existingKeys = await getExistingKeys(client, seed.tableName, seed.keyName)

    await deleteExistingItems(client, seed.tableName, existingKeys)
    await writeItems(client, seed.tableName, items)
    console.log(
      `Seed complete for ${seed.tableName}: deleted=${existingKeys.length}, created=${items.length}, failed=0.`,
    )
  }
}

function createSeedCategories(): Category[] {
  const categoryNames = [
    ['electronics', 'Electronics'],
    ['mobile-phones', 'Mobile Phones'],
    ['laptops', 'Laptops'],
    ['computer-accessories', 'Computer Accessories'],
    ['cameras', 'Cameras'],
    ['audio', 'Audio'],
    ['gaming', 'Gaming'],
    ['smart-home', 'Smart Home'],
    ['home-appliances', 'Home Appliances'],
    ['kitchen', 'Kitchen'],
    ['furniture', 'Furniture'],
    ['home-decor', 'Home Decor'],
    ['lighting', 'Lighting'],
    ['bedding', 'Bedding'],
    ['bath', 'Bath'],
    ['cleaning', 'Cleaning'],
    ['mens-fashion', 'Mens Fashion'],
    ['womens-fashion', 'Womens Fashion'],
    ['shoes', 'Shoes'],
    ['bags', 'Bags'],
    ['watches', 'Watches'],
    ['beauty', 'Beauty'],
    ['skincare', 'Skincare'],
    ['health', 'Health'],
    ['sports', 'Sports'],
    ['outdoors', 'Outdoors'],
    ['books', 'Books'],
    ['stationery', 'Stationery'],
    ['toys', 'Toys'],
    ['baby', 'Baby'],
    ['grocery', 'Grocery'],
    ['snacks', 'Snacks'],
    ['beverages', 'Beverages'],
    ['pet-supplies', 'Pet Supplies'],
    ['automotive', 'Automotive'],
    ['motorbike-accessories', 'Motorbike Accessories'],
    ['tools', 'Tools'],
    ['garden', 'Garden'],
    ['office', 'Office'],
    ['travel', 'Travel'],
  ] as const

  return categoryNames.map(([categoryId, name]) => ({
    categoryId,
    name,
    description: `${name} products for the demo DynamoDB catalogue.`,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
  }))
}

function createSeedProducts(categories: Category[]): Product[] {
  const productTemplates = [
    'Essential Kit',
    'Daily Choice',
    'Premium Set',
    'Compact Edition',
    'Family Pack',
    'Pro Series',
    'Starter Bundle',
    'Smart Upgrade',
    'Classic Model',
    'Travel Version',
  ]

  return Array.from({ length: 400 }, (_, offset) => {
    const index = offset + 1
    const category = categories[offset % categories.length]
    const template = productTemplates[offset % productTemplates.length]
    const paddedIndex = String(index).padStart(3, '0')

    return {
      productId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `${category.name} ${template} ${paddedIndex}`,
      description: `Seed product ${paddedIndex} in ${category.name}, created for learning DynamoDB with a multi-table catalogue.`,
      categoryId: category.categoryId,
      price: 49000 + index * 15000,
      currency: 'VND',
      imageUrl: `https://images.example.com/products/${paddedIndex}.jpg`,
      status: index % 12 === 0 ? ProductStatus.INACTIVE : ProductStatus.ACTIVE,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    }
  })
}

function createSeedInventory(products: Product[]): InventoryRecord[] {
  return products.map((product, index) => ({
    productId: product.productId,
    availableQuantity: 20 + (index % 15),
    reservedQuantity: 0,
    updatedAt: seedTimestamp,
  }))
}

async function getExistingKeys(
  client: ReturnType<typeof createDynamoDbDocumentClient>,
  tableName: string,
  keyName: string,
): Promise<Record<string, unknown>[]> {
  const keys: Record<string, unknown>[] = []
  let exclusiveStartKey: Record<string, unknown> | undefined

  do {
    const response = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: '#seedKey',
        ExpressionAttributeNames: { '#seedKey': keyName },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )
    for (const item of response.Items ?? []) {
      keys.push({ [keyName]: item[keyName] })
    }
    exclusiveStartKey = response.LastEvaluatedKey
  } while (exclusiveStartKey)

  return keys
}

async function deleteExistingItems(
  client: ReturnType<typeof createDynamoDbDocumentClient>,
  tableName: string,
  keys: Record<string, unknown>[],
): Promise<void> {
  for (const keyBatch of chunk(keys, BATCH_WRITE_SIZE)) {
    let requestItems: NonNullable<BatchWriteCommandInput['RequestItems']> = {
      [tableName]: keyBatch.map((Key) => ({ DeleteRequest: { Key } })),
    }

    await sendBatchWriteUntilComplete(client, requestItems)
  }
}

async function writeItems(
  client: ReturnType<typeof createDynamoDbDocumentClient>,
  tableName: string,
  items: SeedItem[],
): Promise<void> {
  for (const itemBatch of chunk(items, BATCH_WRITE_SIZE)) {
    let requestItems: NonNullable<BatchWriteCommandInput['RequestItems']> = {
      [tableName]: itemBatch.map((Item) => ({
        PutRequest: { Item: Item as Record<string, unknown> },
      })),
    }

    await sendBatchWriteUntilComplete(client, requestItems)
  }
}

async function sendBatchWriteUntilComplete(
  client: ReturnType<typeof createDynamoDbDocumentClient>,
  requestItems: NonNullable<BatchWriteCommandInput['RequestItems']>,
): Promise<void> {
  let attempt = 0

  do {
    const response = await client.send(new BatchWriteCommand({ RequestItems: requestItems }))
    requestItems = response.UnprocessedItems ?? {}
    if (Object.keys(requestItems).length > 0) {
      attempt += 1
      await wait(Math.min(1000, 50 * 2 ** attempt))
    }
  } while (Object.keys(requestItems).length > 0)
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

void main().catch((error: unknown) => {
  console.error('Failed to seed DynamoDB tables. Run npm run infra:deploy first.', error)
  process.exitCode = 1
})
