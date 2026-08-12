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
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { Category } from './category.types'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { PaginationQueryDto } from '../pagination/pagination-query.dto'
import { PaginatedResponse } from '../pagination/pagination.types'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'

@Injectable()
export class CategoriesService {
  private readonly tableName: string

  constructor(
    private readonly dynamoDbService: DynamoDbService,
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
      return category
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new ConflictException(`Category ${dto.categoryId} already exists.`)
      }
      throw error
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponse<Category>> {
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
      return response.Attributes as Category
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
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Category ${categoryId} was not found.`)
      }
      throw error
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
