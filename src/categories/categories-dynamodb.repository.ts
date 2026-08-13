import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { PaginationQueryDto } from '../pagination/pagination-query.dto'
import type { PaginatedResponse } from '../pagination/pagination.types'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'
import type { Category } from './category.types'
import type { CategoryRepository } from './categories.repository'
import type { UpdateCategoryInput } from './inputs/update-category.input'

export class CategoriesDynamoDbRepository implements CategoryRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(category: Category): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: category,
        ConditionExpression: 'attribute_not_exists(#categoryId)',
        ExpressionAttributeNames: { '#categoryId': 'categoryId' },
      }),
    )
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponse<Category>> {
    const pagination = resolvePaginationState('categories', query)
    const response = await this.documentClient.send(
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

  async findOne(categoryId: string): Promise<Category | null> {
    const response = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { categoryId },
      }),
    )

    return (response.Item as Category | undefined) ?? null
  }

  async update(
    categoryId: string,
    dto: UpdateCategoryInput,
    updatedAt: string,
  ): Promise<Category | null> {
    const mutableFields = Object.entries(dto).filter(([, value]) => value !== undefined)
    const expressionAttributeNames: Record<string, string> = {
      '#categoryId': 'categoryId',
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
        Key: { categoryId },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ConditionExpression: 'attribute_exists(#categoryId)',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    )

    return (response.Attributes as Category | undefined) ?? null
  }

  async remove(categoryId: string): Promise<boolean> {
    await this.documentClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { categoryId },
        ConditionExpression: 'attribute_exists(#categoryId)',
        ExpressionAttributeNames: { '#categoryId': 'categoryId' },
      }),
    )

    return true
  }
}
