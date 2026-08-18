import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { randomUUID } from 'crypto'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { SqsService } from '../sqs/sqs.service'
import { CartService } from '../cart/cart.service'
import { InventoryService } from '../inventory/inventory.service'
import { ProductsService } from '../products/products.service'
import { OrderStatus } from './order-status.enum'
import { Order, OrderItem, OrderItemSnapshot, OrderQueuePayload } from './order.types'
import { UpdateOrderStatusDto } from './dto/update-order-status.dto'

@Injectable()
export class OrdersService {
  private readonly ordersTableName: string
  private readonly orderItemsTableName: string
  private readonly queueUrl: string

  constructor(
    @Inject(DynamoDbService) private readonly dynamoDbService: DynamoDbService,
    @Inject(SqsService) private readonly sqsService: SqsService,
    @Inject(CartService) private readonly cartService: CartService,
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
    @Inject(ProductsService) private readonly productsService: ProductsService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.ordersTableName = configService.get<string>('ORDERS_TABLE') ?? 'orders'
    this.orderItemsTableName = configService.get<string>('ORDER_ITEMS_TABLE') ?? 'order-items'
    this.queueUrl = configService.get<string>('ORDER_PROCESSING_QUEUE_URL') ?? ''
  }

  /**
   * placeOrder — core method của toàn bộ SQS integration.
   *
   * Flow:
   * 1. Lấy cart items của user
   * 2. Validate từng product (tồn tại + ACTIVE)
   * 3. Reserve stock trong inventory (atomic DynamoDB update)
   * 4. Tạo Order record trong DynamoDB với status=PENDING
   * 5. Enqueue message vào SQS → trả về 202 Accepted
   * 6. Clear cart
   *
   * Tại sao trả về 202 thay vì 201?
   * → 202 Accepted: request đã được nhận và sẽ được xử lý, nhưng chưa hoàn thành.
   * → Order thực sự được "confirm" ở Order Processor Lambda (async).
   * → Đây là pattern chuẩn cho async request processing.
   */
  async placeOrder(userId: string): Promise<{ orderId: string; status: OrderStatus }> {
    // 1. Lấy cart items
    const cartItems = await this.cartService.getCart(userId)
    if (cartItems.length === 0) {
      throw new BadRequestException('Cart is empty. Add items before placing an order.')
    }

    // 2. Validate products và build order item snapshots
    const orderItems: OrderItemSnapshot[] = []
    for (const cartItem of cartItems) {
      const product = await this.productsService.findOne(cartItem.productId)
      orderItems.push({
        productId: product.productId,
        productName: product.name,
        quantity: cartItem.quantity,
        unitPrice: product.price,
        currency: 'VND',
      })
    }

    const totalAmount = orderItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    )

    // 3. Reserve stock (atomic — fail fast nếu không đủ hàng)
    const reservedItems: Array<{ productId: string; quantity: number }> = []
    try {
      for (const item of orderItems) {
        await this.inventoryService.reserveStock(item.productId, item.quantity)
        reservedItems.push({ productId: item.productId, quantity: item.quantity })
      }
    } catch (error) {
      // Rollback: hoàn lại stock đã reserve trước đó nếu 1 item bị fail
      await this.rollbackReservations(reservedItems)
      throw error
    }

    // 4. Tạo Order record trong DynamoDB với status=PENDING
    const orderId = randomUUID()
    const timestamp = new Date().toISOString()
    const order: Order = {
      orderId,
      userId,
      status: OrderStatus.PENDING,
      totalAmount,
      currency: 'VND',
      items: orderItems,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.ordersTableName,
        Item: order,
      }),
    )

    // 5. Enqueue message vào SQS
    //
    // SendMessageCommand anatomy:
    // - QueueUrl: URL của queue (từ env var, được set bởi CDK khi deploy)
    // - MessageBody: JSON string — payload chính mà consumer sẽ parse
    // - MessageAttributes: metadata đi kèm message (không phải payload chính)
    //   → Dùng để filter, route, hoặc log mà không cần parse body
    //
    // Response trả về: { MessageId, MD5OfMessageBody }
    // MessageId là unique identifier của message trong SQS (không phải orderId)
    const sqsPayload: OrderQueuePayload = {
      orderId,
      userId,
      items: orderItems,
      totalAmount,
    }

    try {
      const sqsResponse = await this.sqsService.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(sqsPayload),
          // MessageAttributes: metadata đi kèm, không nằm trong MessageBody
          // Consumer có thể đọc attributes mà không cần parse toàn bộ body
          MessageAttributes: {
            userId: {
              DataType: 'String',
              StringValue: userId,
            },
            orderTimestamp: {
              DataType: 'String',
              StringValue: timestamp,
            },
          },
        }),
      )

      // Lưu MessageId để trace trong logs (optional — không dùng để DeleteMessage)
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.ordersTableName,
          Key: { orderId },
          UpdateExpression: 'SET #sqsMessageId = :msgId, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#sqsMessageId': 'sqsMessageId',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':msgId': sqsResponse.MessageId,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
    } catch (error) {
      // SQS enqueue thất bại → rollback order và stock
      await this.rollbackReservations(reservedItems)
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.ordersTableName,
          Key: { orderId },
          UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: {
            ':status': OrderStatus.FAILED,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
      throw error
    }

    // 6. Clear cart sau khi enqueue thành công
    await this.cartService.clearCart(userId)

    return { orderId, status: OrderStatus.PENDING }
  }

  /** Lấy orders của user (customer chỉ thấy orders của mình) */
  async findByUser(userId: string): Promise<Order[]> {
    // NOTE: Dùng Scan + FilterExpression vì orders table không có GSI trên userId.
    // Đây là acceptable cho mục đích học tập.
    // Trong production: thêm GSI (userId-index) để Query thay vì Scan.
    const response = await this.dynamoDbService.documentClient.send(
      new ScanCommand({
        TableName: this.ordersTableName,
        FilterExpression: '#userId = :userId',
        ExpressionAttributeNames: { '#userId': 'userId' },
        ExpressionAttributeValues: { ':userId': userId },
      }),
    )

    return (response.Items ?? []) as Order[]
  }

  /** Lấy 1 order theo orderId */
  async findOne(orderId: string): Promise<Order> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
      }),
    )

    if (!response.Item) {
      throw new NotFoundException(`Order ${orderId} not found.`)
    }

    return response.Item as Order
  }

  /**
   * cancelOrder — cancel order đang PENDING.
   *
   * Vì đây là SQS Standard Queue và ta không lưu receiptHandle,
   * strategy cancel là:
   * 1. Update status → CANCELLED trong DynamoDB
   * 2. Release stock reservation
   * 3. Order Processor Lambda sẽ check status trước khi xử lý (idempotency guard)
   *    → Nếu status đã là CANCELLED → skip processing
   *
   * Đây là application-level cancel pattern — phù hợp và reliable hơn
   * việc cố DeleteMessage (race condition với visibility timeout).
   */
  async cancelOrder(userId: string, orderId: string): Promise<Order> {
    const order = await this.findOne(orderId)

    // Chỉ owner mới được cancel
    if (order.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own orders.')
    }

    // Chỉ PENDING orders mới có thể cancel
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel order with status '${order.status}'. Only PENDING orders can be cancelled.`,
      )
    }

    const timestamp = new Date().toISOString()

    // Update status → CANCELLED
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ConditionExpression: '#status = :pendingStatus',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': OrderStatus.CANCELLED,
          ':pendingStatus': OrderStatus.PENDING,
          ':updatedAt': timestamp,
        },
      }),
    )

    // Release stock cho tất cả items
    for (const item of order.items) {
      await this.inventoryService.releaseReservation(item.productId, item.quantity)
    }

    return { ...order, status: OrderStatus.CANCELLED, updatedAt: timestamp }
  }

  /** Manual status update bởi MANAGER/ADMIN */
  async updateStatus(orderId: string, dto: UpdateOrderStatusDto): Promise<Order> {
    const order = await this.findOne(orderId)

    const timestamp = new Date().toISOString()
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(#orderId)',
        ExpressionAttributeNames: {
          '#orderId': 'orderId',
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': dto.status,
          ':updatedAt': timestamp,
        },
      }),
    )

    return { ...order, status: dto.status, updatedAt: timestamp }
  }

  /** Rollback stock reservations khi placeOrder fails partway through */
  private async rollbackReservations(
    reservedItems: Array<{ productId: string; quantity: number }>,
  ): Promise<void> {
    await Promise.allSettled(
      reservedItems.map((item) =>
        this.inventoryService.releaseReservation(item.productId, item.quantity),
      ),
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SQS Consumer — gọi bởi Order Processor Lambda qua NestJS Standalone
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * processOrder — consumer logic, tái sử dụng từ Lambda handler.
   *
   * Tại sao đặt logic này trong NestJS Service thay vì trong Lambda handler?
   * → NestJS Standalone Application cho phép Lambda bootstrap NestJS context
   *   và inject service bình thường — không cần duplicate DynamoDB client setup.
   * → Toàn bộ service layer (DynamoDbService, InventoryService) được tái dùng.
   * → TypeScript types, error handling, business logic nhất quán giữa API Lambda
   *   và Order Processor Lambda.
   * → Dễ unit test hơn (test service method thay vì test Lambda handler).
   *
   * Flow:
   * 1. Idempotency check — SQS at-least-once có thể deliver duplicate
   * 2. Tạo OrderItems trong order-items table
   * 3. Confirm stock reservation (reserved -= qty)
   * 4. Update order status → CONFIRMED (với race condition guard)
   *
   * Nếu method này throw → Lambda fail → SQS retry → DLQ sau maxReceiveCount lần.
   */
  async processOrder(payload: OrderQueuePayload): Promise<void> {
    const { orderId, userId, items, totalAmount } = payload

    console.log(`[OrdersService.processOrder] Processing order ${orderId} for user ${userId}`)

    // ── 1. Idempotency Check ────────────────────────────────────────────────
    //
    // SQS Standard Queue đảm bảo AT-LEAST-ONCE delivery:
    // Cùng 1 message có thể được deliver hơn 1 lần (ví dụ khi Lambda timeout).
    // Phải check status trước khi xử lý để đảm bảo idempotency.
    //
    // Cases:
    //   PENDING   → xử lý bình thường
    //   CONFIRMED → đã xử lý lần trước (duplicate delivery) → skip
    //   CANCELLED → user đã cancel → skip, không tạo order items
    //   FAILED    → đã fail nhiều lần, đã vào DLQ → skip
    const order = await this.findOne(orderId).catch(() => null)

    if (!order) {
      // Order không tồn tại → có thể là data corruption → throw để retry
      throw new Error(`[OrdersService.processOrder] Order ${orderId} not found in DB.`)
    }

    if (order.status !== OrderStatus.PENDING) {
      console.log(
        `[OrdersService.processOrder] Order ${orderId} has status '${order.status}'. ` +
          `Skipping (idempotent guard).`,
      )
      // Return (không throw) → Lambda success → SQS tự delete message
      return
    }

    // ── 2. Create OrderItems ────────────────────────────────────────────────
    //
    // Tạo order-items records trong DynamoDB bằng BatchWriteCommand.
    // BatchWriteCommand giới hạn 25 items/request → loop theo chunks.
    const orderItemRecords: OrderItem[] = items.map((item) => ({
      orderId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      currency: 'VND' as const,
    }))

    const BATCH_SIZE = 25
    for (let i = 0; i < orderItemRecords.length; i += BATCH_SIZE) {
      const chunk = orderItemRecords.slice(i, i + BATCH_SIZE)
      await this.dynamoDbService.documentClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.orderItemsTableName]: chunk.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        }),
      )
    }

    // ── 3. Confirm Stock Reservation ────────────────────────────────────────
    //
    // reserveStock() (lúc PENDING) đã: stock -= qty, reserved += qty
    // confirmReservation() bây giờ:    reserved -= qty
    // → Kết quả cuối: stock thực sự bị tiêu thụ, reserved = 0 (accounting đúng)
    for (const item of items) {
      await this.inventoryService.confirmReservation(item.productId, item.quantity)
    }

    // ── 4. Update Order Status → CONFIRMED ──────────────────────────────────
    //
    // ConditionExpression: '#status = :pending'
    // → Race condition guard: nếu user cancel TRONG LÚC processor đang chạy,
    //   DynamoDB sẽ throw ConditionalCheckFailedException thay vì ghi đè CANCELLED.
    // → Đây là lý do tại sao cancelOrder() cũng dùng ConditionExpression.
    const timestamp = new Date().toISOString()
    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.ordersTableName,
          Key: { orderId },
          UpdateExpression: 'SET #status = :confirmed, #updatedAt = :updatedAt',
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':confirmed': OrderStatus.CONFIRMED,
            ':pending': OrderStatus.PENDING,
            ':updatedAt': timestamp,
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        // Order đã bị cancel trong lúc processor đang chạy
        // → Hoàn lại stock vì order items đã được tạo ở bước 2
        console.warn(
          `[OrdersService.processOrder] Order ${orderId} was cancelled during processing. ` +
            `Releasing reservations.`,
        )
        await this.rollbackReservations(
          items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        )
        return // Không throw → Lambda success, message sẽ bị delete
      }
      throw error
    }

    console.log(
      `[OrdersService.processOrder] Order ${orderId} CONFIRMED. Total: ${totalAmount} VND`,
    )
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
