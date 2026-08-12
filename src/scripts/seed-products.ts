import 'dotenv/config';
import {
  BatchGetCommand,
  BatchGetCommandInput,
  BatchWriteCommand,
  BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { createDynamoDbDocumentClient } from '../dynamodb/dynamodb.config';
import { ProductStatus } from '../products/product-status.enum';
import { Product } from '../products/product.types';

const tableName = process.env.PRODUCTS_TABLE ?? 'products';
const BATCH_GET_SIZE = 100;
const BATCH_WRITE_SIZE = 25;
const seedTimestamp = '2026-08-11T00:00:00.000Z';

const categories = [
  ['electronics', 'Thiết bị điện tử'],
  ['home', 'Nhà cửa'],
  ['fashion', 'Thời trang'],
  ['books', 'Sách'],
  ['grocery', 'Tiêu dùng'],
] as const;

async function main(): Promise<void> {
  const client = createDynamoDbDocumentClient();
  const products = createSeedProducts();
  const existingIds = await getExistingIds(client, products.map(({ productId }) => productId));
  const missingProducts = products.filter(({ productId }) => !existingIds.has(productId));

  await writeMissingProducts(client, missingProducts);
  console.log(
    `Seed complete for ${tableName}: created=${missingProducts.length}, skipped=${existingIds.size}, failed=0.`,
  );
}

function createSeedProducts(): Product[] {
  return Array.from({ length: 200 }, (_, offset) => {
    const index = offset + 1;
    const [categoryId, categoryName] = categories[offset % categories.length];
    const paddedIndex = String(index).padStart(3, '0');
    return {
      productId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `${categoryName} mẫu ${paddedIndex}`,
      description: `Sản phẩm mẫu ${paddedIndex} thuộc danh mục ${categoryName}, dùng để học DynamoDB.`,
      categoryId,
      price: 99000 + index * 12500,
      currency: 'VND',
      imageUrl: `https://images.example.com/products/${paddedIndex}.jpg`,
      status: index % 10 === 0 ? ProductStatus.INACTIVE : ProductStatus.ACTIVE,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    };
  });
}

async function getExistingIds(
  client: ReturnType<typeof createDynamoDbDocumentClient>,
  productIds: string[],
): Promise<Set<string>> {
  const existingIds = new Set<string>();
  for (const keys of chunk(productIds, BATCH_GET_SIZE)) {
    let requestItems: NonNullable<BatchGetCommandInput['RequestItems']> = {
      [tableName]: { Keys: keys.map((productId) => ({ productId })) },
    };
    do {
      const response = await client.send(new BatchGetCommand({ RequestItems: requestItems }));
      for (const item of response.Responses?.[tableName] ?? []) {
        existingIds.add(item.productId as string);
      }
      requestItems = response.UnprocessedKeys ?? {};
      if (Object.keys(requestItems).length > 0) {
        await wait(50);
      }
    } while (Object.keys(requestItems).length > 0);
  }
  return existingIds;
}

async function writeMissingProducts(
  client: ReturnType<typeof createDynamoDbDocumentClient>,
  products: Product[],
): Promise<void> {
  for (const productBatch of chunk(products, BATCH_WRITE_SIZE)) {
    let requestItems: NonNullable<BatchWriteCommandInput['RequestItems']> = {
      [tableName]: productBatch.map((Item) => ({ PutRequest: { Item } })),
    };
    let attempt = 0;
    do {
      const response = await client.send(new BatchWriteCommand({ RequestItems: requestItems }));
      requestItems = response.UnprocessedItems ?? {};
      if (Object.keys(requestItems).length > 0) {
        attempt += 1;
        await wait(Math.min(1000, 50 * 2 ** attempt));
      }
    } while (Object.keys(requestItems).length > 0);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch((error: unknown) => {
  console.error('Failed to seed products. Run npm run db:setup first.', error);
  process.exitCode = 1;
});
