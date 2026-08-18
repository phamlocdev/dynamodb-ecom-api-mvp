import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { InventoryItem } from './inventory.types'

@Injectable()
export class InventoryService {
  private readonly tableName: string

  constructor(
    @Inject(DynamoDbService) private readonly dynamoDbService: DynamoDbService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('INVENTORY_TABLE') ?? 'inventory'
  }

  /** Lấy inventory record của 1 product */
  async getInventory(productId: string): Promise<InventoryItem> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { productId },
      }),
    )

    if (!response.Item) {
      throw new NotFoundException(`Inventory for product ${productId} not found.`)
    }

    return response.Item as InventoryItem
  }

  /**
   * Upsert stock cho 1 product (dùng khi seed data hoặc restock).
   * reserved = 0 khi set lại stock (admin operation).
   */
  async setStock(productId: string, stock: number): Promise<InventoryItem> {
    const timestamp = new Date().toISOString()
    const item: InventoryItem = {
      productId,
      stock,
      reserved: 0,
      updatedAt: timestamp,
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    )

    return item
  }

  /**
   * Atomic stock reservation — trừ stock khi order được đặt (PENDING state).
   *
   * Dùng DynamoDB Atomic Counter với ConditionExpression để đảm bảo:
   * - stock >= quantity trước khi trừ (tránh stock âm)
   * - Nếu không đủ hàng → ConditionalCheckFailedException → 409 Conflict
   *
   * "Atomic" nghĩa là: nếu có 100 request đồng thời reserve cùng 1 sản phẩm,
   * DynamoDB đảm bảo chỉ đủ số request thành công, không có race condition.
   */
  async reserveStock(productId: string, quantity: number): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { productId },
          // SET stock = stock - :qty, reserved = reserved + :qty
          // ConditionExpression: đảm bảo stock >= quantity
          UpdateExpression: 'SET #stock = #stock - :qty, #reserved = #reserved + :qty, #updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(#productId) AND #stock >= :qty',
          ExpressionAttributeNames: {
            '#productId': 'productId',
            '#stock': 'stock',
            '#reserved': 'reserved',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':qty': quantity,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new ConflictException(
          `Insufficient stock for product ${productId}. Requested: ${quantity}.`,
        )
      }
      throw error
    }
  }

  /**
   * Hoàn lại stock đã reserved — gọi khi order bị cancel hoặc processor fail.
   *
   * stock = stock + quantity, reserved = reserved - quantity
   */
  async releaseReservation(productId: string, quantity: number): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { productId },
          UpdateExpression: 'SET #stock = #stock + :qty, #reserved = #reserved - :qty, #updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(#productId)',
          ExpressionAttributeNames: {
            '#productId': 'productId',
            '#stock': 'stock',
            '#reserved': 'reserved',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':qty': quantity,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Inventory for product ${productId} not found.`)
      }
      throw error
    }
  }

  /**
   * Confirm reservation sau khi order processor xử lý thành công.
   *
   * Chỉ giảm `reserved` counter — KHÔNG hoàn lại `stock`.
   * Lý do: stock đã bị trừ từ lúc reserveStock() (khi order PENDING).
   *        Ở bước confirm, stock đã "thực sự" bị tiêu thụ, chỉ cần "giải phóng"
   *        reserved label để accounting chính xác.
   *
   * So sánh:
   *   reserveStock:        stock -= qty, reserved += qty  (khi PENDING)
   *   confirmReservation:  reserved -= qty                (khi CONFIRMED)
   *   releaseReservation:  stock += qty, reserved -= qty  (khi CANCELLED)
   */
  async confirmReservation(productId: string, quantity: number): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { productId },
          UpdateExpression: 'SET #reserved = #reserved - :qty, #updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(#productId) AND #reserved >= :qty',
          ExpressionAttributeNames: {
            '#productId': 'productId',
            '#reserved': 'reserved',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':qty': quantity,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        // Log nhưng không throw — accounting sai không nên block confirm flow
        console.warn(
          `[InventoryService] confirmReservation failed for product ${productId} (qty: ${quantity}). ` +
            `Reserved may be lower than expected. Skipping.`,
        )
        return
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
