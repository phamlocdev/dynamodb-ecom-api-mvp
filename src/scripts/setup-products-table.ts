import 'dotenv/config';
import {
  CreateTableCommand,
  DescribeTableCommand,
  KeySchemaElement,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { createDynamoDbClient } from '../dynamodb/dynamodb.config';

const tableName = process.env.PRODUCTS_TABLE ?? 'products';
const expectedKeySchema: KeySchemaElement[] = [
  { AttributeName: 'productId', KeyType: 'HASH' },
];

async function main(): Promise<void> {
  const client = createDynamoDbClient();

  try {
    const description = await client.send(new DescribeTableCommand({ TableName: tableName }));
    assertCompatibleSchema(description.Table?.KeySchema);
    console.log(`Table ${tableName} already exists and has the expected schema.`);
    return;
  } catch (error) {
    if (!isResourceNotFound(error)) {
      throw error;
    }
  }

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
      KeySchema: expectedKeySchema,
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
  const waiter = await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
  if (waiter.state !== 'SUCCESS') {
    throw new Error(`Table ${tableName} was not ready after 30 seconds.`);
  }
  console.log(`Created table ${tableName}.`);
}

function assertCompatibleSchema(keySchema: KeySchemaElement[] | undefined): void {
  const isCompatible =
    keySchema?.length === expectedKeySchema.length &&
    keySchema.every(
      (entry, index) =>
        entry.AttributeName === expectedKeySchema[index].AttributeName &&
        entry.KeyType === expectedKeySchema[index].KeyType,
    );
  if (!isCompatible) {
    throw new Error(
      `Table ${tableName} exists but does not use productId as its only partition key. Choose another PRODUCTS_TABLE name or reset LocalStack data.`,
    );
  }
}

function isResourceNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ResourceNotFoundException'
  );
}

void main().catch((error: unknown) => {
  console.error('Failed to set up the products table.', error);
  process.exitCode = 1;
});
