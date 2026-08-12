import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { CursorScope, PaginatedResponse } from '../pagination/pagination.types'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'
import { ListProductsQueryInput } from './inputs/list-products-query.input'
import { UpdateProductInput } from './inputs/update-product.input'
import { ProductStatus } from './product-status.enum'
import { Product } from './product.types'
import { ProductRepository } from './products.repository'

export class ProductsDynamoDbRepository implements ProductRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(product: Product): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: product,
        ConditionExpression: 'attribute_not_exists(#productId)',
        ExpressionAttributeNames: { '#productId': 'productId' },
      }),
    )
  }

  async findAll(query: ListProductsQueryInput): Promise<PaginatedResponse<Product>> {
    const filters = normalizeProductFilters(query)
    const cursorScope = toCursorScope(filters)
    const filterExpression = buildProductFilterExpression(filters)

    const pagination = resolvePaginationState('products', query, cursorScope)
    const items: Product[] = []
    let scannedCount = 0
    let lastEvaluatedKey = pagination.startKey ?? undefined

    do {
      const remainingNeeded = pagination.limit - items.length
      const response = await this.documentClient.send(
        new ScanCommand({
          TableName: this.tableName,
          Limit: remainingNeeded,
          ExclusiveStartKey: lastEvaluatedKey,
          ...filterExpression,
        }),
      )

      items.push(...((response.Items ?? []) as Product[]))
      scannedCount += response.ScannedCount ?? 0
      lastEvaluatedKey = response.LastEvaluatedKey
    } while (items.length < pagination.limit && lastEvaluatedKey)

    return {
      ...toPaginatedResponse('products', pagination, items, lastEvaluatedKey),
      scannedCount,
    }
  }

  async findOne(productId: string): Promise<Product | null> {
    const response = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { productId },
      }),
    )

    return (response.Item as Product | undefined) ?? null
  }

  async update(
    productId: string,
    dto: UpdateProductInput,
    updatedAt: string,
  ): Promise<Product | null> {
    const mutableFields = Object.entries(dto).filter(([, value]) => value !== undefined)
    const expressionAttributeNames: Record<string, string> = {
      '#productId': 'productId',
      '#updatedAt': 'updatedAt',
    }
    const expressionAttributeValues: Record<string, unknown> = {
      ':updatedAt': updatedAt,
    }
    const updateParts = mutableFields.map(([field, value]) => {
      const nameKey = `#${field}`
      const valueKey = `:${field}`
      expressionAttributeNames[nameKey] = field
      expressionAttributeValues[valueKey] = value
      return `${nameKey} = ${valueKey}`
    })
    updateParts.push('#updatedAt = :updatedAt')

    const response = await this.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { productId },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ConditionExpression: 'attribute_exists(#productId)',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    )

    return (response.Attributes as Product | undefined) ?? null
  }

  async remove(productId: string): Promise<boolean> {
    await this.documentClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { productId },
        ConditionExpression: 'attribute_exists(#productId)',
        ExpressionAttributeNames: { '#productId': 'productId' },
      }),
    )

    return true
  }
}

interface ProductFilters {
  categoryId?: string
  status?: ProductStatus
  minPrice?: number
  maxPrice?: number
  updatedFrom?: string
  updatedTo?: string
  q?: string
}

interface ProductFilterExpression {
  FilterExpression?: string
  ExpressionAttributeNames?: Record<string, string>
  ExpressionAttributeValues?: Record<string, unknown>
}

function normalizeProductFilters(query: ListProductsQueryInput): ProductFilters {
  return {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.minPrice !== undefined ? { minPrice: query.minPrice } : {}),
    ...(query.maxPrice !== undefined ? { maxPrice: query.maxPrice } : {}),
    ...(query.updatedFrom ? { updatedFrom: new Date(query.updatedFrom).toISOString() } : {}),
    ...(query.updatedTo ? { updatedTo: new Date(query.updatedTo).toISOString() } : {}),
    ...(query.q ? { q: query.q } : {}),
  }
}

function toCursorScope(filters: ProductFilters): CursorScope {
  const scope: CursorScope = {}

  if (filters.categoryId) {
    scope.categoryId = filters.categoryId
  }
  if (filters.status) {
    scope.status = filters.status
  }
  if (filters.minPrice !== undefined) {
    scope.minPrice = String(filters.minPrice)
  }
  if (filters.maxPrice !== undefined) {
    scope.maxPrice = String(filters.maxPrice)
  }
  if (filters.updatedFrom) {
    scope.updatedFrom = filters.updatedFrom
  }
  if (filters.updatedTo) {
    scope.updatedTo = filters.updatedTo
  }
  if (filters.q) {
    scope.q = filters.q
  }

  return scope
}

function buildProductFilterExpression(filters: ProductFilters): ProductFilterExpression {
  const expressions: string[] = []
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}

  if (filters.categoryId) {
    names['#categoryId'] = 'categoryId'
    values[':categoryId'] = filters.categoryId
    expressions.push('#categoryId = :categoryId')
  }
  if (filters.status) {
    names['#status'] = 'status'
    values[':status'] = filters.status
    expressions.push('#status = :status')
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    names['#price'] = 'price'
    if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
      values[':minPrice'] = filters.minPrice
      values[':maxPrice'] = filters.maxPrice
      expressions.push('#price BETWEEN :minPrice AND :maxPrice')
    } else if (filters.minPrice !== undefined) {
      values[':minPrice'] = filters.minPrice
      expressions.push('#price >= :minPrice')
    } else {
      values[':maxPrice'] = filters.maxPrice
      expressions.push('#price <= :maxPrice')
    }
  }
  if (filters.updatedFrom || filters.updatedTo) {
    names['#updatedAt'] = 'updatedAt'
    if (filters.updatedFrom && filters.updatedTo) {
      values[':updatedFrom'] = filters.updatedFrom
      values[':updatedTo'] = filters.updatedTo
      expressions.push('#updatedAt BETWEEN :updatedFrom AND :updatedTo')
    } else if (filters.updatedFrom) {
      values[':updatedFrom'] = filters.updatedFrom
      expressions.push('#updatedAt >= :updatedFrom')
    } else {
      values[':updatedTo'] = filters.updatedTo
      expressions.push('#updatedAt <= :updatedTo')
    }
  }
  if (filters.q) {
    names['#name'] = 'name'
    names['#description'] = 'description'
    values[':q'] = filters.q
    expressions.push('(contains(#name, :q) OR contains(#description, :q))')
  }

  if (expressions.length === 0) {
    return {}
  }

  return {
    FilterExpression: expressions.join(' AND '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }
}
