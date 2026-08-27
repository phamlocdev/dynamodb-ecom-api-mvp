import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { commerceMapper, fromCategoryItem } from '../dynamodb/commerce-table.mappers'
import { commerceKeys } from '../dynamodb/commerce-table.keys'
import { CategoryItem } from '../dynamodb/commerce-table.types'
import { CommerceTableService } from '../dynamodb/commerce-table.service'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { Category } from './category.types'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { PaginationQueryDto } from '../pagination/pagination-query.dto'
import { PaginatedResponse } from '../pagination/pagination.types'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name)
  private readonly tableName: string

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(CommerceTableService)
    private readonly commerceTableService: CommerceTableService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('CATEGORIES_TABLE') ?? 'categories'
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const timestamp = new Date().toISOString()
    const category: Category = {
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      await this.dynamoDbService.documentClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: category,
          ConditionExpression: 'attribute_not_exists(#categoryId)',
          ExpressionAttributeNames: { '#categoryId': 'categoryId' },
        }),
      )
      await this.mirrorCategory(category)
      return category
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new ConflictException(`Category ${dto.categoryId} already exists.`)
      }
      throw error
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponse<Category>> {
    const singleTablePage = await this.findAllFromCommerceTable(query)
    if (singleTablePage.items.length > 0 || query.cursor) {
      return singleTablePage
    }

    return this.findAllFromLegacyTable(query)
  }

  private async findAllFromCommerceTable(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<Category>> {
    const pagination = resolvePaginationState('categories', query)
    const response = await this.commerceTableService.query({
      IndexName: 'GSI1',
      KeyConditionExpression: '#gsi1pk = :gsi1pk',
      ExpressionAttributeNames: { '#gsi1pk': 'GSI1PK' },
      ExpressionAttributeValues: { ':gsi1pk': 'CATEGORY' },
      Limit: pagination.limit,
      ExclusiveStartKey: pagination.startKey ?? undefined,
    })
    return toPaginatedResponse(
      'categories',
      pagination,
      (response.Items ?? []).map((item) => fromCategoryItem(item as CategoryItem)),
      response.LastEvaluatedKey,
    )
  }

  private async findAllFromLegacyTable(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<Category>> {
    const pagination = resolvePaginationState('categories', query)
    const response = await this.dynamoDbService.documentClient.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: pagination.limit,
        ExclusiveStartKey: pagination.startKey ?? undefined,
      }),
    )
    return toPaginatedResponse(
      'categories',
      pagination,
      (response.Items ?? []) as Category[],
      response.LastEvaluatedKey,
    )
  }

  async findOne(categoryId: string): Promise<Category> {
    const commerceCategory = await this.commerceTableService.get<CategoryItem>(
      commerceKeys.category(categoryId),
    )
    if (commerceCategory) {
      return fromCategoryItem(commerceCategory)
    }

    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({ TableName: this.tableName, Key: { categoryId } }),
    )
    if (!response.Item) {
      throw new NotFoundException(`Category ${categoryId} was not found.`)
    }
    return response.Item as Category
  }

  async update(categoryId: string, dto: UpdateCategoryDto): Promise<Category> {
    const mutableFields = Object.entries(dto).filter(([, value]) => value !== undefined)
    if (mutableFields.length === 0) {
      throw new BadRequestException('Provide at least one category field to update.')
    }

    const timestamp = new Date().toISOString()
    const expressionAttributeNames: Record<string, string> = {
      '#categoryId': 'categoryId',
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
          Key: { categoryId },
          UpdateExpression: `SET ${updateParts.join(', ')}`,
          ConditionExpression: 'attribute_exists(#categoryId)',
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        }),
      )
      const category = response.Attributes as Category
      await this.upsertCategoryMirror(category)
      return category
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Category ${categoryId} was not found.`)
      }
      throw error
    }
  }

  async remove(categoryId: string): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { categoryId },
          ConditionExpression: 'attribute_exists(#categoryId)',
          ExpressionAttributeNames: { '#categoryId': 'categoryId' },
        }),
      )
      await this.deleteCategoryMirror(categoryId)
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Category ${categoryId} was not found.`)
      }
      throw error
    }
  }

  private async mirrorCategory(category: Category): Promise<void> {
    try {
      await this.commerceTableService.put(
        commerceMapper.toCategoryItem(category),
        'attribute_not_exists(#pk)',
        { '#pk': 'PK' },
      )
    } catch (error) {
      if (!isConditionalCheckFailure(error)) {
        this.logger.warn(`Failed to mirror category ${category.categoryId} into commerce table.`)
      }
    }
  }

  private async upsertCategoryMirror(category: Category): Promise<void> {
    try {
      await this.commerceTableService.put(commerceMapper.toCategoryItem(category))
    } catch {
      this.logger.warn(`Failed to upsert category ${category.categoryId} into commerce table.`)
    }
  }

  private async deleteCategoryMirror(categoryId: string): Promise<void> {
    try {
      await this.commerceTableService.delete(commerceKeys.category(categoryId))
    } catch {
      this.logger.warn(`Failed to delete category ${categoryId} from commerce table.`)
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
