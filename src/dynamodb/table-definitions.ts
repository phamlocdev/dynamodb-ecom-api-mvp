import { AttributeDefinition, KeySchemaElement } from '@aws-sdk/client-dynamodb'

export interface TableDefinition {
  tableName: string
  attributeDefinitions: AttributeDefinition[]
  keySchema: KeySchemaElement[]
  billingMode: 'PAY_PER_REQUEST'
}

export function getTableDefinitions(): TableDefinition[] {
  return [
    {
      tableName: 'products',
      attributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
      keySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
      billingMode: 'PAY_PER_REQUEST',
    },
    {
      tableName: 'categories',
      attributeDefinitions: [{ AttributeName: 'categoryId', AttributeType: 'S' }],
      keySchema: [{ AttributeName: 'categoryId', KeyType: 'HASH' }],
      billingMode: 'PAY_PER_REQUEST',
    },
  ]
}
