import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BatchGetCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { DEFAULT_PAGE_SIZE } from '../pagination/pagination-query.dto'
import { CursorScope, PaginatedResponse } from '../pagination/pagination.types'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'
import { Product } from '../products/product.types'
import { ProductStatus } from '../products/product-status.enum'
import { InventoryRecord, InventorySummary, ReservedInventoryItem } from './inventory.types'
import { ListInventoriesQueryDto } from './dto/list-inventories-query.dto'

@Injectable()
export class InventoryService {
  private readonly tableName: string
  private readonly productsTableName: string

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('INVENTORY_TABLE') ?? 'inventory'
    this.productsTableName = configService.get<string>('PRODUCTS_TABLE') ?? 'products'
  }

  async ensureInventoryRecord(productId: string): Promise<InventoryRecord> {
    const existing = await this.findOne(productId)
    if (existing) {
      return existing
    }

    const record: InventoryRecord = {
      productId,
      availableQuantity: 0,
      reservedQuantity: 0,
      updatedAt: new Date().toISOString(),
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
        ConditionExpression: 'attribute_not_exists(productId)',
        ExpressionAttributeValues: {
          ':productId': productId,
        },
      }),
    )

    return record
  }

  async findOne(productId: string): Promise<InventoryRecord | null> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { productId },
      }),
    )

    return (response.Item as InventoryRecord | undefined) ?? null
  }

  async findAll(query: ListInventoriesQueryDto): Promise<PaginatedResponse<InventorySummary>> {
    if (query.productIds && query.productIds.length > 0) {
      const items = await this.findSummariesByProductIds(query.productIds)
      return {
        items,
        previousCursor: null,
        nextCursor: null,
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
        currentPage: 1,
      }
    }

    const filters = normalizeInventoryFilters(query)
    const cursorScope = toCursorScope(filters)
    const filterExpression = buildInventoryProductFilterExpression(filters)
    const pagination = resolvePaginationState('inventories', query, cursorScope)
    const items: InventorySummary[] = []
    let scannedCount = 0
    let lastEvaluatedKey = pagination.startKey ?? undefined

    do {
      const remainingNeeded = pagination.limit - items.length
      const response = await this.dynamoDbService.documentClient.send(
        new ScanCommand({
          TableName: this.productsTableName,
          Limit: remainingNeeded,
          ExclusiveStartKey: lastEvaluatedKey,
          ...filterExpression,
        }),
      )

      const products = (response.Items ?? []) as Product[]
      const inventoryRecords = await Promise.all(
        products.map((product) => this.ensureInventoryRecord(product.productId)),
      )

      items.push(...products.map((product, index) => toInventorySummary(product, inventoryRecords[index])))
      scannedCount += response.ScannedCount ?? 0
      lastEvaluatedKey = response.LastEvaluatedKey
    } while (items.length < pagination.limit && lastEvaluatedKey)

    return {
      ...toPaginatedResponse('inventories', pagination, items, lastEvaluatedKey),
      scannedCount,
    }
  }

  async findOneSummary(productId: string): Promise<InventorySummary> {
    const product = await this.findProductOrThrow(productId)
    const inventory = await this.ensureInventoryRecord(productId)
    return toInventorySummary(product, inventory)
  }

  async updateAvailableQuantity(productId: string, availableQuantity: number): Promise<InventorySummary> {
    if (availableQuantity < 0) {
      throw new BadRequestException('availableQuantity must be a non-negative integer.')
    }

    const product = await this.findProductOrThrow(productId)
    await this.ensureInventoryRecord(productId)

    const response = await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { productId },
        UpdateExpression: 'SET #availableQuantity = :availableQuantity, #updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(#productId)',
        ExpressionAttributeNames: {
          '#productId': 'productId',
          '#availableQuantity': 'availableQuantity',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':availableQuantity': availableQuantity,
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      }),
    )

    return toInventorySummary(product, response.Attributes as InventoryRecord)
  }

  private async findSummariesByProductIds(productIds: string[]): Promise<InventorySummary[]> {
    const dedupedProductIds = [...new Set(productIds)]
    const products = await this.findProductsByIds(dedupedProductIds)
    const inventoryRecords = await this.findOrCreateInventoryRecordsByProductIds(
      products.map((product) => product.productId),
    )

    const inventoryMap = new Map(
      inventoryRecords.map((inventory) => [inventory.productId, inventory] as const),
    )

    return products
      .map((product) => {
        const inventory = inventoryMap.get(product.productId)
        return inventory ? toInventorySummary(product, inventory) : null
      })
      .filter((item): item is InventorySummary => item !== null)
  }

  private async findProductOrThrow(productId: string): Promise<Product> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.productsTableName,
        Key: { productId },
      }),
    )

    if (!response.Item) {
      throw new NotFoundException(`Product ${productId} was not found.`)
    }

    return response.Item as Product
  }

  private async findProductsByIds(productIds: string[]): Promise<Product[]> {
    if (productIds.length === 0) {
      return []
    }

    const productChunks = chunk(productIds, 100)
    const products: Product[] = []

    for (const currentChunk of productChunks) {
      const response = await this.dynamoDbService.documentClient.send(
        new BatchGetCommand({
          RequestItems: {
            [this.productsTableName]: {
              Keys: currentChunk.map((productId) => ({ productId })),
            },
          },
        }),
      )

      products.push(...(((response.Responses?.[this.productsTableName] ?? []) as Product[])))
    }

    const productMap = new Map(products.map((product) => [product.productId, product] as const))
    return productIds
      .map((productId) => productMap.get(productId))
      .filter((product): product is Product => Boolean(product))
  }

  private async findOrCreateInventoryRecordsByProductIds(productIds: string[]): Promise<InventoryRecord[]> {
    if (productIds.length === 0) {
      return []
    }

    const inventoryChunks = chunk(productIds, 100)
    const inventoryRecords: InventoryRecord[] = []

    for (const currentChunk of inventoryChunks) {
      const response = await this.dynamoDbService.documentClient.send(
        new BatchGetCommand({
          RequestItems: {
            [this.tableName]: {
              Keys: currentChunk.map((productId) => ({ productId })),
            },
          },
        }),
      )

      inventoryRecords.push(...(((response.Responses?.[this.tableName] ?? []) as InventoryRecord[])))
    }

    const inventoryMap = new Map(
      inventoryRecords.map((inventory) => [inventory.productId, inventory] as const),
    )

    const missingProductIds = productIds.filter((productId) => !inventoryMap.has(productId))

    if (missingProductIds.length === 0) {
      return productIds
        .map((productId) => inventoryMap.get(productId))
        .filter((inventory): inventory is InventoryRecord => Boolean(inventory))
    }

    const createdRecords = await Promise.all(
      missingProductIds.map((productId) => this.ensureInventoryRecord(productId)),
    )

    for (const record of createdRecords) {
      inventoryMap.set(record.productId, record)
    }

    return productIds
      .map((productId) => inventoryMap.get(productId))
      .filter((inventory): inventory is InventoryRecord => Boolean(inventory))
  }

  async reserve(productId: string, quantity: number): Promise<void> {
    const inventoryRecord = await this.ensureInventoryRecord(productId)

    try {
      // if (inventoryRecord.availableQuantity < quantity) {
      //   throw new ConflictException(`Insufficient inventory for product ${productId}.`)
      // }

      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { productId },
          UpdateExpression:
            'SET #availableQuantity = #availableQuantity - :quantity, #reservedQuantity = #reservedQuantity + :quantity, #updatedAt = :updatedAt',
          ConditionExpression: '#availableQuantity >= :quantity',
          ExpressionAttributeNames: {
            '#availableQuantity': 'availableQuantity',
            '#reservedQuantity': 'reservedQuantity',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':quantity': quantity,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new ConflictException(`Insufficient inventory for product ${productId}.`)
      }
      throw error
    }
  }

  async release(items: ReservedInventoryItem[]): Promise<void> {
    for (const item of items) {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { productId: item.productId },
          UpdateExpression:
            'SET #availableQuantity = #availableQuantity + :quantity, #reservedQuantity = #reservedQuantity - :quantity, #updatedAt = :updatedAt',
          ConditionExpression: '#reservedQuantity >= :quantity',
          ExpressionAttributeNames: {
            '#availableQuantity': 'availableQuantity',
            '#reservedQuantity': 'reservedQuantity',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':quantity': item.quantity,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
    }
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

interface InventoryFilters {
  q?: string
  status?: ProductStatus
}

interface InventoryFilterExpression {
  FilterExpression?: string
  ExpressionAttributeNames?: Record<string, string>
  ExpressionAttributeValues?: Record<string, unknown>
}

function normalizeInventoryFilters(query: ListInventoriesQueryDto): InventoryFilters {
  return {
    ...(query.q ? { q: query.q } : {}),
    ...(query.status ? { status: query.status } : {}),
  }
}

function toCursorScope(filters: InventoryFilters): CursorScope {
  const scope: CursorScope = {}

  if (filters.q) {
    scope.q = filters.q
  }

  if (filters.status) {
    scope.status = filters.status
  }

  return scope
}

function buildInventoryProductFilterExpression(
  filters: InventoryFilters,
): InventoryFilterExpression {
  const expressions: string[] = []
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}

  if (filters.status) {
    names['#status'] = 'status'
    values[':status'] = filters.status
    expressions.push('#status = :status')
  }

  if (filters.q) {
    names['#productId'] = 'productId'
    names['#name'] = 'name'
    names['#description'] = 'description'
    values[':q'] = filters.q
    expressions.push('(contains(#productId, :q) OR contains(#name, :q) OR contains(#description, :q))')
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

function toInventorySummary(product: Product, inventory: InventoryRecord): InventorySummary {
  return {
    productId: product.productId,
    productName: product.name,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    productStatus: product.status,
    availableQuantity: inventory.availableQuantity,
    reservedQuantity: inventory.reservedQuantity,
    updatedAt: inventory.updatedAt,
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}
