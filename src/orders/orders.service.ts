import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { AuthenticatedUser } from '../auth/auth.types'
import { Role } from '../auth/roles.enum'
import { CartsService } from '../carts/carts.service'
import { CartStatus } from '../carts/cart-status.enum'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'
import { PaginatedResponse } from '../pagination/pagination.types'
import { UsersService } from '../users/users.service'
import { OrdersQueueService } from './orders.queue'
import { CreateOrderDto } from './dto/create-order.dto'
import { ListOrdersQueryDto } from './dto/list-orders-query.dto'
import { OrderStatus } from './order-status.enum'
import {
  PAYMENT_WINDOW_EXPIRED_REASON,
  resolvePaymentConfirmationTimeoutSeconds,
} from './payment-reservation.config'
import { PaymentStatus } from './payment-status.enum'
import { Order, OrderDetails, OrderItem, PlaceOrderMessage } from './orders.types'

const ORDERS_ENTITY_TYPE = 'ORDER'

@Injectable()
export class OrdersService {
  private readonly ordersTableName: string
  private readonly orderItemsTableName: string
  private readonly paymentConfirmationTimeoutSeconds: number

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(CartsService)
    private readonly cartsService: CartsService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
    @Inject(OrdersQueueService)
    private readonly ordersQueueService: OrdersQueueService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.ordersTableName = configService.get<string>('ORDERS_TABLE') ?? 'orders'
    this.orderItemsTableName = configService.get<string>('ORDER_ITEMS_TABLE') ?? 'order-items'
    this.paymentConfirmationTimeoutSeconds = resolvePaymentConfirmationTimeoutSeconds(
      configService.get<string>('PAYMENT_CONFIRMATION_SECONDS_TIMEOUT'),
    )
  }

  async createOrderRequest(user: AuthenticatedUser, dto: CreateOrderDto): Promise<Order> {
    const cart = await this.cartsService.getOwnedCartOrThrow(user.sub, dto.cartId)
    if (cart.status === CartStatus.EXPIRED || cart.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new BadRequestException(`Cart ${dto.cartId} has expired.`)
    }

    const profile =
      user.name && user.email
        ? { username: user.username, name: user.name, email: user.email, sub: user.sub }
        : await this.usersService.findCustomerProfileByUsername(user.username)

    const timestamp = new Date().toISOString()
    const order: Order = {
      orderId: randomUUID(),
      customerId: user.sub,
      customerEmail: user.email ?? profile.email,
      customerName: user.name ?? profile.name,
      cartId: dto.cartId,
      status: OrderStatus.PENDING,
      entityType: ORDERS_ENTITY_TYPE,
      deduplicationKey: randomUUID(),
      paymentStatus: PaymentStatus.NOT_STARTED,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.ordersTableName,
        Item: order,
        ConditionExpression: 'attribute_not_exists(#orderId)',
        ExpressionAttributeNames: { '#orderId': 'orderId' },
      }),
    )

    const message: PlaceOrderMessage = {
      orderId: order.orderId,
      customerId: order.customerId,
      cartId: order.cartId,
      deduplicationKey: order.deduplicationKey,
      requestedAt: timestamp,
    }
    await this.ordersQueueService.enqueuePlaceOrder(message)

    return order
  }

  async findAll(
    user: AuthenticatedUser,
    query: ListOrdersQueryDto,
  ): Promise<PaginatedResponse<Order>> {
    const isAdminOrManager = user.groups.includes(Role.ADMIN) || user.groups.includes(Role.MANAGER)

    const scope = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.customerEmail ? { customerEmail: query.customerEmail } : {}),
      ...(isAdminOrManager ? { role: 'staff' } : { role: 'customer' }),
    }
    const pagination = resolvePaginationState('orders', query, scope)

    const queryInput = isAdminOrManager
      ? buildStaffOrderQuery(query, pagination.startKey ?? undefined)
      : buildCustomerOrderQuery(user.sub, pagination.startKey ?? undefined)

    const response = await this.dynamoDbService.documentClient.send(
      new QueryCommand({
        TableName: this.ordersTableName,
        Limit: pagination.limit,
        ScanIndexForward: false,
        ...queryInput,
      }),
    )

    return toPaginatedResponse(
      'orders',
      pagination,
      (response.Items ?? []) as Order[],
      response.LastEvaluatedKey,
    )
  }

  async findOne(user: AuthenticatedUser, orderId: string): Promise<OrderDetails> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
      }),
    )

    if (!response.Item) {
      throw new NotFoundException(`Order ${orderId} was not found.`)
    }

    const order = response.Item as Order
    const isAdminOrManager = user.groups.includes(Role.ADMIN) || user.groups.includes(Role.MANAGER)
    if (!isAdminOrManager && order.customerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this order.')
    }

    const items = await this.findOrderItems(order.orderId)
    return {
      ...order,
      items,
    }
  }

  async getById(orderId: string): Promise<Order> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
      }),
    )

    if (!response.Item) {
      throw new NotFoundException(`Order ${orderId} was not found.`)
    }

    return response.Item as Order
  }

  async triggerPayment(user: AuthenticatedUser, orderId: string): Promise<Order> {
    const order = await this.getById(orderId)
    const isAdminOrManager = user.groups.includes(Role.ADMIN) || user.groups.includes(Role.MANAGER)

    if (!isAdminOrManager && order.customerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this order.')
    }
    if (order.status !== OrderStatus.RESERVED) {
      throw new BadRequestException(`Order ${orderId} is not ready for payment.`)
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException(`Order ${orderId} is already paid.`)
    }
    if (order.paymentStatus === PaymentStatus.PROCESSING) {
      throw new BadRequestException(`Order ${orderId} is already processing payment.`)
    }
    if (this.isPaymentExpired(order)) {
      await this.enqueueReleaseForExpiredOrder(order)
      throw new ConflictException(PAYMENT_WINDOW_EXPIRED_REASON)
    }

    const paidAt = new Date().toISOString()
    const nowEpochSeconds = toEpochSeconds(Date.now())
    const paymentTransactionId = `manualpay_${randomUUID()}`

    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.ordersTableName,
          Key: { orderId },
          UpdateExpression:
            'SET #status = :status, #paymentStatus = :paymentStatus, #paymentRequestedAt = :paymentRequestedAt, #paymentTransactionId = :paymentTransactionId, #paidAt = :paidAt, #updatedAt = :updatedAt REMOVE #paymentFailureReason',
          ConditionExpression:
            '#status = :reserved AND (#paymentStatus = :notStarted OR #paymentStatus = :failed) AND #paymentExpiresAt > :now',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#paymentStatus': 'paymentStatus',
            '#paymentExpiresAt': 'paymentExpiresAt',
            '#paymentRequestedAt': 'paymentRequestedAt',
            '#paymentTransactionId': 'paymentTransactionId',
            '#paidAt': 'paidAt',
            '#paymentFailureReason': 'paymentFailureReason',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':reserved': OrderStatus.RESERVED,
            ':notStarted': PaymentStatus.NOT_STARTED,
            ':failed': PaymentStatus.FAILED,
            ':status': OrderStatus.CONFIRMED,
            ':paymentStatus': PaymentStatus.PAID,
            ':paymentRequestedAt': paidAt,
            ':paymentTransactionId': paymentTransactionId,
            ':paidAt': paidAt,
            ':updatedAt': paidAt,
            ':now': nowEpochSeconds,
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        const latestOrder = await this.getById(orderId)
        if (this.isPaymentExpired(latestOrder)) {
          await this.enqueueReleaseForExpiredOrder(latestOrder)
          throw new ConflictException(PAYMENT_WINDOW_EXPIRED_REASON)
        }
        throw new ConflictException(`Order ${orderId} cannot start payment in its current state.`)
      }
      throw error
    }

    return {
      ...(await this.getById(orderId)),
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      paymentRequestedAt: paidAt,
      paymentTransactionId,
      paidAt,
      updatedAt: paidAt,
    }
  }

  async markFailed(orderId: string, status: OrderStatus, failureReason: string): Promise<void> {
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression:
          'SET #status = :status, #failureReason = :failureReason, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#failureReason': 'failureReason',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':failureReason': failureReason,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    )
  }

  async markReserved(orderId: string, totalAmount: number): Promise<void> {
    const timestamp = new Date().toISOString()
    const paymentExpiresAt = toEpochSeconds(Date.now()) + this.paymentConfirmationTimeoutSeconds
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression:
          'SET #status = :status, #reservedAt = :reservedAt, #paymentExpiresAt = :paymentExpiresAt, #totalAmount = :totalAmount, #paymentStatus = :paymentStatus, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#reservedAt': 'reservedAt',
          '#paymentExpiresAt': 'paymentExpiresAt',
          '#totalAmount': 'totalAmount',
          '#paymentStatus': 'paymentStatus',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': OrderStatus.RESERVED,
          ':reservedAt': timestamp,
          ':paymentExpiresAt': paymentExpiresAt,
          ':totalAmount': totalAmount,
          ':paymentStatus': PaymentStatus.NOT_STARTED,
          ':updatedAt': timestamp,
        },
      }),
    )
  }

  async markPaymentSucceeded(
    orderId: string,
    paymentAttemptId: string,
    transactionId: string,
  ): Promise<void> {
    const paidAt = new Date().toISOString()
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression:
          'SET #status = :status, #paymentStatus = :paymentStatus, #paymentTransactionId = :paymentTransactionId, #paidAt = :paidAt, #updatedAt = :updatedAt',
        ConditionExpression:
          '#status = :reserved AND #paymentStatus = :processing AND #paymentAttemptId = :paymentAttemptId',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#paymentStatus': 'paymentStatus',
          '#paymentTransactionId': 'paymentTransactionId',
          '#paymentAttemptId': 'paymentAttemptId',
          '#paidAt': 'paidAt',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':reserved': OrderStatus.RESERVED,
          ':processing': PaymentStatus.PROCESSING,
          ':paymentAttemptId': paymentAttemptId,
          ':status': OrderStatus.CONFIRMED,
          ':paymentStatus': PaymentStatus.PAID,
          ':paymentTransactionId': transactionId,
          ':paidAt': paidAt,
          ':updatedAt': paidAt,
        },
      }),
    )
  }

  async markPaymentFailed(
    orderId: string,
    paymentAttemptId: string,
    failureReason: string,
  ): Promise<void> {
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression:
          'SET #paymentStatus = :paymentStatus, #paymentFailureReason = :paymentFailureReason, #updatedAt = :updatedAt',
        ConditionExpression:
          '#status = :reserved AND #paymentStatus = :processing AND #paymentAttemptId = :paymentAttemptId',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#paymentStatus': 'paymentStatus',
          '#paymentFailureReason': 'paymentFailureReason',
          '#paymentAttemptId': 'paymentAttemptId',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':reserved': OrderStatus.RESERVED,
          ':processing': PaymentStatus.PROCESSING,
          ':paymentAttemptId': paymentAttemptId,
          ':paymentStatus': PaymentStatus.FAILED,
          ':paymentFailureReason': failureReason,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    )
  }

  async updateStatus(orderId: string, status: OrderStatus, failureReason?: string): Promise<void> {
    const names: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    }
    const values: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': new Date().toISOString(),
    }

    let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt'
    if (failureReason) {
      names['#failureReason'] = 'failureReason'
      values[':failureReason'] = failureReason
      updateExpression += ', #failureReason = :failureReason'
    }

    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    )
  }

  async findOrderItems(orderId: string): Promise<OrderItem[]> {
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

  async findExpiredReservedOrders(
    nowEpochSeconds: number,
    limit: number,
    exclusiveStartKey?: Record<string, unknown>,
  ): Promise<{ items: Order[]; lastEvaluatedKey?: Record<string, unknown> }> {
    const response = await this.dynamoDbService.documentClient.send(
      new QueryCommand({
        TableName: this.ordersTableName,
        IndexName: 'GSI_OrderStatusPaymentExpiresAt',
        KeyConditionExpression: '#status = :status AND #paymentExpiresAt <= :paymentExpiresAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#paymentExpiresAt': 'paymentExpiresAt',
        },
        ExpressionAttributeValues: {
          ':status': OrderStatus.RESERVED,
          ':paymentExpiresAt': nowEpochSeconds,
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )

    return {
      items: (response.Items ?? []) as Order[],
      lastEvaluatedKey: response.LastEvaluatedKey as Record<string, unknown> | undefined,
    }
  }

  getPaymentConfirmationTimeoutSeconds(): number {
    return this.paymentConfirmationTimeoutSeconds
  }

  async expireReservationIfUnpaid(orderId: string, paymentExpiresAt: number): Promise<boolean> {
    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.ordersTableName,
          Key: { orderId },
          UpdateExpression:
            'SET #status = :status, #failureReason = :failureReason, #updatedAt = :updatedAt',
          ConditionExpression:
            '#status = :reserved AND #paymentStatus <> :paid AND #paymentExpiresAt = :paymentExpiresAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#paymentStatus': 'paymentStatus',
            '#paymentExpiresAt': 'paymentExpiresAt',
            '#failureReason': 'failureReason',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':reserved': OrderStatus.RESERVED,
            ':paid': PaymentStatus.PAID,
            ':paymentExpiresAt': paymentExpiresAt,
            ':status': OrderStatus.EXPIRED,
            ':failureReason': PAYMENT_WINDOW_EXPIRED_REASON,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
      return true
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        return false
      }
      throw error
    }
  }

  private isPaymentExpired(order: Order): boolean {
    return Boolean(order.paymentExpiresAt && order.paymentExpiresAt <= toEpochSeconds(Date.now()))
  }

  private async enqueueReleaseForExpiredOrder(order: Order): Promise<void> {
    if (order.status !== OrderStatus.RESERVED || !this.isPaymentExpired(order)) {
      return
    }

    const items = await this.findOrderItems(order.orderId)
    if (items.length === 0) {
      return
    }

    await this.ordersQueueService.enqueueReleaseReservation({
      orderId: order.orderId,
      customerId: order.customerId,
      items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      targetStatus: OrderStatus.EXPIRED,
      reason: PAYMENT_WINDOW_EXPIRED_REASON,
    })
  }
}

function toEpochSeconds(timestampMs: number): number {
  return Math.floor(timestampMs / 1000)
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConditionalCheckFailedException'
  )
}

function buildStaffOrderQuery(
  query: ListOrdersQueryDto,
  exclusiveStartKey?: Record<string, unknown>,
): Omit<QueryCommand['input'], 'TableName'> {
  if (query.customerEmail) {
    return {
      IndexName: 'GSI_CustomerEmailOrders',
      KeyConditionExpression: '#customerEmail = :customerEmail',
      ExpressionAttributeNames: { '#customerEmail': 'customerEmail' },
      ExpressionAttributeValues: { ':customerEmail': query.customerEmail },
      ExclusiveStartKey: exclusiveStartKey,
    }
  }

  if (query.customerId) {
    return {
      IndexName: 'GSI_CustomerOrders',
      KeyConditionExpression: '#customerId = :customerId',
      ExpressionAttributeNames: { '#customerId': 'customerId' },
      ExpressionAttributeValues: { ':customerId': query.customerId },
      ExclusiveStartKey: exclusiveStartKey,
    }
  }

  if (query.status) {
    return {
      IndexName: 'GSI_OrderStatusCreatedAt',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': query.status },
      ExclusiveStartKey: exclusiveStartKey,
    }
  }

  return {
    IndexName: 'GSI_OrderCreatedAt',
    KeyConditionExpression: '#entityType = :entityType',
    ExpressionAttributeNames: { '#entityType': 'entityType' },
    ExpressionAttributeValues: { ':entityType': ORDERS_ENTITY_TYPE },
    ExclusiveStartKey: exclusiveStartKey,
  }
}

function buildCustomerOrderQuery(
  customerId: string,
  exclusiveStartKey?: Record<string, unknown>,
): Omit<QueryCommand['input'], 'TableName'> {
  return {
    IndexName: 'GSI_CustomerOrders',
    KeyConditionExpression: '#customerId = :customerId',
    ExpressionAttributeNames: { '#customerId': 'customerId' },
    ExpressionAttributeValues: { ':customerId': customerId },
    ExclusiveStartKey: exclusiveStartKey,
  }
}
