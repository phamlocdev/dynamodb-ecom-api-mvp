import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { EmailTrackingService } from '../mail/email-tracking.service'
import { SesMailService } from '../mail/ses-mail.service'
import { OrderStatus } from '../orders/order-status.enum'
import { PaymentStatus } from '../orders/payment-status.enum'
import type { Order, OrderItem } from '../orders/orders.types'

export interface OrderShippedNotificationEventDetail {
  orderId?: unknown
  shippedAt?: unknown
}

@Injectable()
export class OrderNotificationWorkerService {
  private readonly logger = new Logger(OrderNotificationWorkerService.name)
  private readonly ordersTableName: string
  private readonly orderItemsTableName: string

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(EmailTrackingService)
    private readonly emailTrackingService: EmailTrackingService,
    @Inject(SesMailService)
    private readonly sesMailService: SesMailService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.ordersTableName = configService.get<string>('ORDERS_TABLE') ?? 'orders'
    this.orderItemsTableName = configService.get<string>('ORDER_ITEMS_TABLE') ?? 'order-items'
  }

  async handleOrderShippedEvent(detail: OrderShippedNotificationEventDetail): Promise<void> {
    console.log(`Received OrderShipped event detail: ${JSON.stringify(detail)}.`)

    if (!isNonEmptyString(detail.orderId) || !isNonEmptyString(detail.shippedAt)) {
      this.logger.warn(`Skipped invalid OrderShipped event detail: ${JSON.stringify(detail)}.`)
      return
    }

    const order = await this.findOrder(detail.orderId)
    if (!order) {
      this.logger.warn(
        `Skipped shipped notification because order ${detail.orderId} was not found.`,
      )
      return
    }

    if (order.status !== OrderStatus.SHIPPED || order.paymentStatus !== PaymentStatus.PAID) {
      this.logger.warn(
        `Skipped shipped notification for order ${order.orderId}: status=${order.status}, paymentStatus=${order.paymentStatus}.`,
      )
      return
    }

    const hasActiveTracking = await this.emailTrackingService.hasActiveTracking({
      contextType: 'ORDER',
      contextId: order.orderId,
      emailType: 'SHIPPED_ORDER_NOTIFICATION',
    })
    if (hasActiveTracking) {
      this.logger.log(`Skipped duplicate shipped notification for order ${order.orderId}.`)
      return
    }

    const items = await this.findOrderItems(order.orderId)
    const result = await this.sesMailService.sendShippedOrderNotificationEmail({
      order,
      items,
      shippedAt: detail.shippedAt,
    })

    if (result.status === 'SENT') {
      this.logger.log(`Shipped notification email sent for order ${order.orderId}.`)
      return
    }

    this.logger.warn(
      `Best-effort shipped notification for order ${order.orderId} finished with status=${result.status}: ${result.reason ?? 'unknown-reason'}.`,
    )
  }

  private async findOrder(orderId: string): Promise<Order | undefined> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
      }),
    )

    return response.Item as Order | undefined
  }

  private async findOrderItems(orderId: string): Promise<OrderItem[]> {
    const response = await this.dynamoDbService.documentClient.send(
      new QueryCommand({
        TableName: this.orderItemsTableName,
        KeyConditionExpression: '#orderId = :orderId',
        ExpressionAttributeNames: { '#orderId': 'orderId' },
        ExpressionAttributeValues: { ':orderId': orderId },
      }),
    )

    return (response.Items ?? []) as OrderItem[]
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
