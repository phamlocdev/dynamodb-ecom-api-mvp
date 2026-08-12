import 'dotenv/config'
import { createDynamoDbDocumentClient } from '../dynamodb/dynamodb.config'
import { ProductsCore } from '../products/products.core'
import { ProductsDynamoDbRepository } from '../products/products-dynamodb.repository'

export function createProductsLambdaCore(): ProductsCore {
  const documentClient = createDynamoDbDocumentClient()
  const tableName = process.env.PRODUCTS_TABLE ?? 'products'

  return new ProductsCore({
    repository: new ProductsDynamoDbRepository(documentClient, tableName),
  })
}
