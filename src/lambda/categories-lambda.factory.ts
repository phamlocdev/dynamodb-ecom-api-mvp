import 'dotenv/config'
import { createDynamoDbDocumentClient } from '../dynamodb/dynamodb.config'
import { CategoriesCore } from '../categories/categories.core'
import { CategoriesDynamoDbRepository } from '../categories/categories-dynamodb.repository'

export function createCategoriesLambdaCore(): CategoriesCore {
  const documentClient = createDynamoDbDocumentClient()
  const tableName = process.env.CATEGORIES_TABLE ?? 'categories'

  return new CategoriesCore({
    repository: new CategoriesDynamoDbRepository(documentClient, tableName),
  })
}
