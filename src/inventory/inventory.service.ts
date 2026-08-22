import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { InventoryRecord, ReservedInventoryItem } from './inventory.types'

@Injectable()
export class InventoryService {
  private readonly tableName: string

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('INVENTORY_TABLE') ?? 'inventory'
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
