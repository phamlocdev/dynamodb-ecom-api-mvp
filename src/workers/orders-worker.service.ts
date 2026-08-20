import { Inject, Injectable, Logger } from '@nestjs/common'
import { SQSEvent, SQSBatchResponse, SQSRecord } from 'aws-lambda'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { CartsService } from '../carts/carts.service'
import { CartStatus } from '../carts/cart-status.enum'
import { InventoryService } from '../inventory/inventory.service'
import { ReservedInventoryItem } from '../inventory/inventory.types'
import { PaymentsService } from '../payments/payments.service'
import { PaymentStatus } from '../payments/payment-status.enum'
import { ProductsService } from '../products/products.service'
import { OrderStatus } from '../orders/order-status.enum'
import { OrdersQueueService } from '../orders/orders.queue'
import { OrdersService } from '../orders/orders.service'
import {
  OrderItem,
  PlaceOrderMessage,
  ProcessPaymentMessage,
  ReleaseReservationMessage,
} from '../orders/orders.types'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class OrdersWorkerService {
  private readonly logger = new Logger(OrdersWorkerService.name)
  private readonly orderItemsTableName: string

  constructor(
    @Inject(CartsService)
    private readonly cartsService: CartsService,
    @Inject(InventoryService)
    private readonly inventoryService: InventoryService,
    @Inject(ProductsService)
    private readonly productsService: ProductsService,
    @Inject(PaymentsService)
    private readonly paymentsService: PaymentsService,
    @Inject(OrdersService)
    private readonly ordersService: OrdersService,
    @Inject(OrdersQueueService)
    private readonly ordersQueueService: OrdersQueueService,
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.orderItemsTableName = configService.get<string>('ORDER_ITEMS_TABLE') ?? 'order-items'
  }

  async handlePlaceOrderBatch(event: SQSEvent): Promise<SQSBatchResponse> {
    const failures = []

    for (const record of event.Records) {
      try {
        await this.handlePlaceOrderRecord(record)
      } catch (error) {
        this.logger.error(`Failed place-order record ${record.messageId}`, error)
        failures.push({ itemIdentifier: record.messageId })
      }
    }

    return {
      batchItemFailures: failures,
    }
  }

  async handleReleaseReservationBatch(event: SQSEvent): Promise<SQSBatchResponse> {
    const failures = []

    for (const record of event.Records) {
      try {
        await this.handleReleaseReservationRecord(record)
      } catch (error) {
        this.logger.error(`Failed release-reservation record ${record.messageId}`, error)
        failures.push({ itemIdentifier: record.messageId })
      }
    }

    return {
      batchItemFailures: failures,
    }
  }

  async handleProcessPaymentBatch(event: SQSEvent): Promise<SQSBatchResponse> {
    const failures = []

    for (const record of event.Records) {
      try {
        await this.handleProcessPaymentRecord(record)
      } catch (error) {
        this.logger.error(`Failed process-payment record ${record.messageId}`, error)
        failures.push({ itemIdentifier: record.messageId })
      }
    }

    return {
      batchItemFailures: failures,
    }
  }

  private async handlePlaceOrderRecord(record: SQSRecord): Promise<void> {
    const message = parseJson<PlaceOrderMessage>(record.body)
    const order = await this.ordersService.getById(message.orderId)

    if (order.status !== OrderStatus.PENDING) {
      return
    }

    const cart = await this.cartsService.getOwnedCartOrThrow(message.customerId, message.cartId)
    if (cart.status === CartStatus.EXPIRED || cart.expiresAt <= Math.floor(Date.now() / 1000)) {
      await this.cartsService.markExpired(cart)
      await this.ordersService.markFailed(order.orderId, OrderStatus.EXPIRED, 'Cart expired before checkout.')
      return
    }

    const cartItems = await this.cartsService.getCartItems(cart.cartId)
    if (cartItems.length === 0) {
      await this.ordersService.markFailed(order.orderId, OrderStatus.FAILED, 'Cart has no items.')
      return
    }

    const reservedItems: ReservedInventoryItem[] = []

    try {
      const productSnapshots = await Promise.all(
        cartItems.map(async (item) => {
          const product = await this.productsService.findOne(item.productId)
          await this.inventoryService.reserve(item.productId, item.quantity)
          reservedItems.push({ productId: item.productId, quantity: item.quantity })
          return { item, product }
        }),
      )

      const createdAt = new Date().toISOString()
      const orderItems: OrderItem[] = productSnapshots.map(({ item, product }, index) => ({
        orderId: order.orderId,
        lineId: `${String(index + 1).padStart(3, '0')}-${randomUUID().slice(0, 8)}`,
        productId: product.productId,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal: product.price * item.quantity,
        createdAt,
      }))

      for (const orderItem of orderItems) {
        await this.dynamoDbService.documentClient.send(
          new PutCommand({
            TableName: this.orderItemsTableName,
            Item: orderItem,
          }),
        )
      }

      const totalAmount = orderItems.reduce((total, item) => total + item.lineTotal, 0)
      await this.ordersService.markReserved(order.orderId, totalAmount)
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Failed to process order.'
      await this.ordersService.markFailed(order.orderId, OrderStatus.FAILED, failureReason)

      if (reservedItems.length > 0) {
        await this.ordersQueueService.enqueueReleaseReservation({
          orderId: order.orderId,
          customerId: order.customerId,
          items: reservedItems,
          targetStatus: OrderStatus.FAILED,
          reason: failureReason,
        })
      }

      throw error
    }
  }

  private async handleReleaseReservationRecord(record: SQSRecord): Promise<void> {
    const message = parseJson<ReleaseReservationMessage>(record.body)
    await this.inventoryService.release(message.items)
    await this.ordersService.updateStatus(message.orderId, message.targetStatus, message.reason)
  }

  private async handleProcessPaymentRecord(record: SQSRecord): Promise<void> {
    const message = parseJson<ProcessPaymentMessage>(record.body)
    const order = await this.ordersService.getById(message.orderId)

    if (order.status === OrderStatus.CONFIRMED) {
      return
    }
    if (
      order.paymentStatus !== PaymentStatus.PROCESSING ||
      order.paymentAttemptId !== message.paymentAttemptId
    ) {
      return
    }

    const result = await this.paymentsService.processMockPayment(order.orderId)
    if (result.success && result.transactionId) {
      await this.ordersService.markPaymentSucceeded(
        order.orderId,
        message.paymentAttemptId,
        result.transactionId,
      )
      return
    }

    await this.ordersService.markPaymentFailed(
      order.orderId,
      message.paymentAttemptId,
      result.failureReason ?? 'Mock payment failed.',
    )
  }
}

function parseJson<T>(payload: string): T {
  return JSON.parse(payload) as T
}
