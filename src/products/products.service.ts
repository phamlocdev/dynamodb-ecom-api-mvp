import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { CreateProductDto } from './dto/create-product.dto'
import { ListProductsQueryDto } from './dto/list-products-query.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { ProductStatus } from './product-status.enum'
import { Product } from './product.types'
import { CursorScope, PaginatedResponse } from '../pagination/pagination.types'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'

@Injectable()
export class ProductsService {
  private readonly tableName: string

  constructor(
    private readonly dynamoDbService: DynamoDbService,
    configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('PRODUCTS_TABLE') ?? 'products'
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const timestamp = new Date().toISOString()
    const product: Product = {
      productId: randomUUID(),
      name: dto.name,
      description: dto.description,
      categoryId: dto.categoryId,
      price: dto.price,
      currency: 'VND',
      imageUrl: dto.imageUrl,
      status: dto.status ?? ProductStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      await this.dynamoDbService.documentClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: product,
          ConditionExpression: 'attribute_not_exists(#productId)',
          ExpressionAttributeNames: { '#productId': 'productId' },
        }),
      )
      return product
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new ConflictException('A product with this ID already exists.')
      }
      throw error
    }
  }
  /**
     * const filterExpression = {
      "FilterExpression": "#categoryId = :categoryId AND #status = :status AND #price BETWEEN :minPrice AND :maxPrice AND #updatedAt BETWEEN :updatedFrom AND :updatedTo AND (contains(#name, :q) OR contains(#description, :q))",
      "ExpressionAttributeNames": {
        "#categoryId": "categoryId",
        "#status": "status",
        "#price": "price",
        "#updatedAt": "updatedAt",
        "#name": "name",
        "#description": "description"
      },
      "ExpressionAttributeValues": {
        ":categoryId": "bath",
        ":status": "ACTIVE",
        ":minPrice": 100000,
        ":maxPrice": 500000,
        ":updatedFrom": "2026-08-01T00:00:00.000Z",
        ":updatedTo": "2026-08-31T23:59:59.999Z",
        ":q": "towel"
      }
    }
    */

  async findAll(query: ListProductsQueryDto): Promise<PaginatedResponse<Product>> {
    const filters = normalizeProductFilters(query)
    const cursorScope = toCursorScope(filters)
    const filterExpression = buildProductFilterExpression(filters)

    const pagination = resolvePaginationState('products', query, cursorScope)
    const items: Product[] = []
    let scannedCount = 0
    let lastEvaluatedKey = pagination.startKey ?? undefined

    do {
      // Lấy limit frontend truyền lên trừ đi số lượng item đã filter được
      const remainingNeeded = pagination.limit - items.length
      const response = await this.dynamoDbService.documentClient.send(
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
      // Điều kiện lặp:
      // Khi vẫn tồn tại lastEvaludatedKey cho page tiếp theo
      // Và chưa lấy đủ số LIMIT frontend yêu cầu
    } while (items.length < pagination.limit && lastEvaluatedKey)

    return {
      ...toPaginatedResponse('products', pagination, items, lastEvaluatedKey),
      scannedCount,
    }
  }

  async findOne(productId: string): Promise<Product> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { productId },
      }),
    )
    if (!response.Item) {
      throw new NotFoundException(`Product ${productId} was not found.`)
    }
    return response.Item as Product
  }

  async update(productId: string, dto: UpdateProductDto): Promise<Product> {
    const mutableFields = Object.entries(dto).filter(([, value]) => value !== undefined)
    if (mutableFields.length === 0) {
      throw new BadRequestException('Provide at least one product field to update.')
    }

    const timestamp = new Date().toISOString()
    const expressionAttributeNames: Record<string, string> = {
      '#productId': 'productId',
      '#updatedAt': 'updatedAt',
    }
    const expressionAttributeValues: Record<string, unknown> = {
      ':updatedAt': timestamp,
    }
    const updateParts = mutableFields.map(([field, value]) => {
      const nameKey = `#${field}`
      const valueKey = `:${field}`
      expressionAttributeNames[nameKey] = field
      expressionAttributeValues[valueKey] = value
      return `${nameKey} = ${valueKey}`
    })
    updateParts.push('#updatedAt = :updatedAt')

    try {
      const response = await this.dynamoDbService.documentClient.send(
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
      return response.Attributes as Product
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Product ${productId} was not found.`)
      }
      throw error
    }
  }

  async remove(productId: string): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { productId },
          ConditionExpression: 'attribute_exists(#productId)',
          ExpressionAttributeNames: { '#productId': 'productId' },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Product ${productId} was not found.`)
      }
      throw error
    }
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

function normalizeProductFilters(query: ListProductsQueryDto): ProductFilters {
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

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConditionalCheckFailedException'
  )
}
