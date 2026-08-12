import 'dotenv/config';
import {
  CreateTableCommand,
  DescribeTableCommand,
  TableDescription,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { createDynamoDbClient } from '../dynamodb/dynamodb.config';
import { getTableDefinitions, TableDefinition } from '../dynamodb/table-definitions';

async function main(): Promise<void> {
  const client = createDynamoDbClient();

  for (const definition of getTableDefinitions()) {
    await ensureTable(client, definition);
  }
}

async function ensureTable(
  client: ReturnType<typeof createDynamoDbClient>,
  definition: TableDefinition,
): Promise<void> {
  try {
    const response = await client.send(
      new DescribeTableCommand({ TableName: definition.tableName }),
    );
    assertCompatibleTable(response.Table, definition);
    console.log(`Table ${definition.tableName} already exists and has the expected schema.`);
    return;
  } catch (error) {
    if (!isResourceNotFound(error)) {
      throw error;
    }
  }

  await client.send(
    new CreateTableCommand({
      TableName: definition.tableName,
      AttributeDefinitions: definition.attributeDefinitions,
      KeySchema: definition.keySchema,
      BillingMode: definition.billingMode,
    }),
  );
  const waiter = await waitUntilTableExists(
    { client, maxWaitTime: 30 },
    { TableName: definition.tableName },
  );
  if (waiter.state !== 'SUCCESS') {
    throw new Error(`Table ${definition.tableName} was not ready after 30 seconds.`);
  }
  console.log(`Created table ${definition.tableName}.`);
}

function assertCompatibleTable(
  table: TableDescription | undefined,
  definition: TableDefinition,
): void {
  const hasExpectedKeySchema =
    table?.KeySchema?.length === definition.keySchema.length &&
    definition.keySchema.every((expected) =>
      table.KeySchema?.some(
        (actual) =>
          actual.AttributeName === expected.AttributeName && actual.KeyType === expected.KeyType,
      ),
    );
  const hasExpectedAttributeDefinitions = definition.attributeDefinitions.every((expected) =>
    table?.AttributeDefinitions?.some(
      (actual) =>
        actual.AttributeName === expected.AttributeName &&
        actual.AttributeType === expected.AttributeType,
    ),
  );

  if (!hasExpectedKeySchema || !hasExpectedAttributeDefinitions) {
    throw new Error(
      `Table ${definition.tableName} exists but its key schema is incompatible. Choose another table name or reset LocalStack data.`,
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
  console.error('Failed to set up DynamoDB tables.', error);
  process.exitCode = 1;
});
