import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { CartItem } from './cart.types'
import { AddCartItemDto } from './dto/add-cart-item.dto'

@Injectable()
export class CartService {
  private readonly tableName: string

  constructor(
    @Inject(DynamoDbService) private readonly dynamoDbService: DynamoDbService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('CARTS_TABLE') ?? 'carts'
  }

  /**
   * Lấy toàn bộ cart items của user.
   *
   * DynamoDB Query (không phải Scan!) vì ta có PK = userId.
   * KeyConditionExpression: "userId = :uid" → chỉ đọc đúng partition của user đó.
   * Đây là lợi thế của composite PK design: query hiệu quả O(items trong cart).
   */
  async getCart(userId: string): Promise<CartItem[]> {
    const response = await this.dynamoDbService.documentClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#userId = :userId',
        ExpressionAttributeNames: { '#userId': 'userId' },
        ExpressionAttributeValues: { ':userId': userId },
      }),
    )

    return (response.Items ?? []) as CartItem[]
  }

  /**
   * Thêm item vào cart (upsert — nếu productId đã tồn tại thì ghi đè quantity).
   *
   * Dùng PutCommand với composite key (userId + productId).
   * addedAt chỉ được set lần đầu; nếu upsert thì timestamp được update.
   */
  async addItem(userId: string, dto: AddCartItemDto): Promise<CartItem> {
    const item: CartItem = {
      userId,
      productId: dto.productId,
      quantity: dto.quantity,
      addedAt: new Date().toISOString(),
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
   * Xóa 1 item khỏi cart theo productId.
   * ConditionExpression đảm bảo item phải tồn tại (không xóa ghost item).
   */
  async removeItem(userId: string, productId: string): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { userId, productId },
          ConditionExpression: 'attribute_exists(#userId)',
          ExpressionAttributeNames: { '#userId': 'userId' },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Cart item for product ${productId} not found.`)
      }
      throw error
    }
  }

  /**
   * Xóa toàn bộ cart của user — gọi sau khi order được enqueue thành công.
   *
   * DynamoDB không có "delete all items with PK = X" trong 1 command.
   * Cần: (1) Query để lấy tất cả items, (2) BatchWriteItem để xóa.
   * BatchWriteItem giới hạn 25 items/request → cần chunk nếu cart lớn.
   */
  async clearCart(userId: string): Promise<void> {
    const items = await this.getCart(userId)
    if (items.length === 0) return

    // Chunk thành batches của 25 (giới hạn của BatchWriteItem)
    const BATCH_SIZE = 25
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE)
      await this.dynamoDbService.documentClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((item) => ({
              DeleteRequest: {
                Key: { userId: item.userId, productId: item.productId },
              },
            })),
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
