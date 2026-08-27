import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { DynamoDbService } from './dynamodb.service'
import { COMMERCE_TABLE_FALLBACK } from './commerce-table.constants'
import { CommerceTableItem } from './commerce-table.types'

@Injectable()
export class CommerceTableService {
  readonly tableName: string

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('ECOMMERCE_TABLE') ?? COMMERCE_TABLE_FALLBACK
  }

  isEnabled(): boolean {
    return Boolean(this.tableName)
  }

  async put(
    item: CommerceTableItem,
    conditionExpression?: string,
    expressionAttributeNames?: Record<string, string>,
  ) {
    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ...(conditionExpression ? { ConditionExpression: conditionExpression } : {}),
        ...(expressionAttributeNames ? { ExpressionAttributeNames: expressionAttributeNames } : {}),
      }),
    )
  }

  async get<TItem extends CommerceTableItem>(
    key: Pick<CommerceTableItem, 'PK' | 'SK'>,
  ): Promise<TItem | null> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
      }),
    )

    return (response.Item as TItem | undefined) ?? null
  }

  async delete(
    key: Pick<CommerceTableItem, 'PK' | 'SK'>,
    conditionExpression?: string,
    expressionAttributeNames?: Record<string, string>,
  ) {
    await this.dynamoDbService.documentClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: key,
        ...(conditionExpression ? { ConditionExpression: conditionExpression } : {}),
        ...(expressionAttributeNames ? { ExpressionAttributeNames: expressionAttributeNames } : {}),
      }),
    )
  }

  async update(commandInput: Omit<UpdateCommand['input'], 'TableName'>) {
    return this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        ...commandInput,
      }),
    )
  }

  async query(commandInput: Omit<QueryCommand['input'], 'TableName'>) {
    return this.dynamoDbService.documentClient.send(
      new QueryCommand({
        TableName: this.tableName,
        ...commandInput,
      }),
    )
  }
}
