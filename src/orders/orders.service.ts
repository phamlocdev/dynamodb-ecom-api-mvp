import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { AuthenticatedUser } from '../auth/auth.types'
import { Role } from '../auth/roles.enum'
import { CartsService } from '../carts/carts.service'
import { CartStatus } from '../carts/cart-status.enum'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { InventoryService } from '../inventory/inventory.service'
import { ReservedInventoryItem } from '../inventory/inventory.types'
import { resolvePaginationState, toPaginatedResponse } from '../pagination/pagination.util'
import { PaginatedResponse } from '../pagination/pagination.types'
import { Product } from '../products/product.types'
import { ProductsService } from '../products/products.service'
import { UsersService } from '../users/users.service'
import { OrdersQueueService } from './orders.queue'
import { CreateOrderDto } from './dto/create-order.dto'
import { ListOrdersQueryDto } from './dto/list-orders-query.dto'
import { OrderStatus } from './order-status.enum'
import { PAYMENT_WINDOW_EXPIRED_REASON } from './payment-reservation.config'
import { PaymentStatus } from './payment-status.enum'
import {
  Order,
  OrderDetails,
  OrderItem,
  TriggerPaymentResult,
  VnpayReturnResult,
} from './orders.types'
import { VnpayService } from './vnpay.service'
import {
  InpOrderAlreadyConfirmed,
  IpnFailChecksum,
  IpnInvalidAmount,
  IpnOrderNotFound,
  IpnSuccess,
  IpnUnknownError,
  type IpnResponse,
  type VerifyIpnCall,
} from 'vnpay'

const ORDERS_ENTITY_TYPE = 'ORDER'
const VNPAY_PAYMENT_EXPIRY_SKEW_SECONDS = 5
const AUTO_REFUND_CREATE_BY = 'system-auto-refund'
const AUTO_REFUND_REASON =
  'Payment arrived after reservation expiry. Amount refunded automatically.'

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)
  private readonly ordersTableName: string
  private readonly orderItemsTableName: string
  private readonly inventoryTableName: string
  private readonly paymentConfirmationTimeoutSeconds: number

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(CartsService)
    private readonly cartsService: CartsService,
    @Inject(InventoryService)
    private readonly inventoryService: InventoryService,
    @Inject(ProductsService)
    private readonly productsService: ProductsService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
    @Inject(OrdersQueueService)
    private readonly ordersQueueService: OrdersQueueService,
    @Inject(VnpayService)
    private readonly vnpayService: VnpayService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.ordersTableName = configService.get<string>('ORDERS_TABLE') ?? 'orders'
    this.orderItemsTableName = configService.get<string>('ORDER_ITEMS_TABLE') ?? 'order-items'
    this.inventoryTableName = configService.get<string>('INVENTORY_TABLE') ?? 'inventory'
    this.paymentConfirmationTimeoutSeconds = Number(
      configService.getOrThrow<number>('PAYMENT_CONFIRMATION_SECONDS_TIMEOUT'),
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

    this.logger.log(
      `>>>>>> [START]: Processing order ${order.orderId} for cart ${order.cartId} and customer ${order.customerId}.`,
    )

    const cartItems = await this.cartsService.getCartItems(cart.cartId)
    if (cartItems.length === 0) {
      this.logger.warn(
        `>>>>>> [WARN]: Order ${order.orderId} failed because cart ${cart.cartId} has no items.`,
      )
      await this.markFailed(order.orderId, OrderStatus.FAILED, 'Cart has no items.')
      return this.getById(order.orderId)
    }

    const reservedItems: ReservedInventoryItem[] = []

    try {
      const productSnapshots: Array<{ item: (typeof cartItems)[number]; product: Product }> = []
      for (const item of cartItems) {
        const product = await this.productsService.findOne(item.productId)

        await this.inventoryService.reserve(item.productId, item.quantity)
        reservedItems.push({ productId: item.productId, quantity: item.quantity })
        productSnapshots.push({ item, product })
      }

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
      await this.markReserved(order.orderId, totalAmount)
      this.logger.log(
        `>>>>>> [SUCCESS]: Order ${order.orderId} reserved successfully with ${orderItems.length} items and totalAmount=${totalAmount}.`,
      )
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Failed to process order.'

      if (reservedItems.length > 0) {
        await this.failPendingOrderAndReleaseReservation(
          order.orderId,
          failureReason,
          reservedItems,
        )
      } else {
        await this.markFailed(order.orderId, OrderStatus.FAILED, failureReason)
      }

      if (error instanceof ConflictException) {
        this.logger.warn(
          `>>>>>> [FAIL]: Order ${order.orderId} failed during reservation: ${failureReason}`,
        )
      } else {
        this.logger.error(`>>>>>> [ERROR]: Order ${order.orderId} failed during processing.`, error)
      }

      if (!(error instanceof ConflictException)) {
        throw error
      }
    }

    return this.getById(order.orderId)
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

  async triggerPayment(
    user: AuthenticatedUser,
    orderId: string,
    clientIp: string,
  ): Promise<TriggerPaymentResult> {
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
    if (order.totalAmount === undefined) {
      throw new BadRequestException(`Order ${orderId} does not have a payable amount.`)
    }
    if (this.isPaymentExpired(order)) {
      await this.releaseExpiredOrderReservation(order)
      throw new ConflictException(PAYMENT_WINDOW_EXPIRED_REASON)
    }
    if (!order.paymentExpiresAt) {
      throw new BadRequestException(`Order ${orderId} does not have a payment deadline.`)
    }

    const paymentAttemptId = randomUUID()
    const requestedAt = new Date()
    const requestedAtIso = requestedAt.toISOString()
    const nowEpochSeconds = toEpochSeconds(requestedAt.getTime())
    const paymentGatewayExpiresAt = order.paymentExpiresAt - VNPAY_PAYMENT_EXPIRY_SKEW_SECONDS
    if (paymentGatewayExpiresAt <= nowEpochSeconds) {
      throw new ConflictException(
        'Payment window is about to expire. Please place the order again.',
      )
    }
    const paymentUrl = await this.vnpayService.buildOrderPaymentUrl({
      amount: order.totalAmount,
      clientIp,
      createDate: requestedAt,
      expireDate: new Date(paymentGatewayExpiresAt * 1000),
      orderId,
      orderInfo: buildPaymentOrderInfo(orderId),
    })

    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.ordersTableName,
          Key: { orderId },
          UpdateExpression:
            'SET #paymentStatus = :paymentStatus, #paymentRequestedAt = :paymentRequestedAt, #paymentAttemptId = :paymentAttemptId, #updatedAt = :updatedAt REMOVE #paymentFailureReason, #paymentTransactionId, #paidAt',
          ConditionExpression:
            '#status = :reserved AND (#paymentStatus = :notStarted OR #paymentStatus = :failed OR #paymentStatus = :processing) AND #paymentExpiresAt > :now',
          ExpressionAttributeNames: {
            '#paymentStatus': 'paymentStatus',
            '#status': 'status',
            '#paymentExpiresAt': 'paymentExpiresAt',
            '#paymentRequestedAt': 'paymentRequestedAt',
            '#paymentAttemptId': 'paymentAttemptId',
            '#paymentFailureReason': 'paymentFailureReason',
            '#paymentTransactionId': 'paymentTransactionId',
            '#paidAt': 'paidAt',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':reserved': OrderStatus.RESERVED,
            ':notStarted': PaymentStatus.NOT_STARTED,
            ':failed': PaymentStatus.FAILED,
            ':processing': PaymentStatus.PROCESSING,
            ':paymentStatus': PaymentStatus.PROCESSING,
            ':paymentRequestedAt': requestedAtIso,
            ':paymentAttemptId': paymentAttemptId,
            ':updatedAt': requestedAtIso,
            ':now': nowEpochSeconds,
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        const latestOrder = await this.getById(orderId)
        if (this.isPaymentExpired(latestOrder)) {
          await this.releaseExpiredOrderReservation(latestOrder)
          throw new ConflictException(PAYMENT_WINDOW_EXPIRED_REASON)
        }
        throw new ConflictException(`Order ${orderId} cannot start payment in its current state.`)
      }
      throw error
    }

    return {
      orderId,
      paymentStatus: PaymentStatus.PROCESSING,
      paymentUrl,
      paymentExpiresAt: order.paymentExpiresAt,
    }
  }

  async handleVnpayReturn(query: Record<string, string>): Promise<VnpayReturnResult> {
    try {
      const verify = await this.vnpayService.verifyReturnQuery(query)
      if (verify.isVerified) {
        try {
          await this.reconcileVerifiedGatewayResult(verify, 'return')
        } catch (error) {
          this.logger.error(
            `Failed to reconcile VNPay return for order ${verify.vnp_TxnRef}.`,
            error,
          )
        }
      }

      return {
        redirectUrl: this.vnpayService.buildFrontendPaymentReturnUrl(query, {
          isVerified: verify.isVerified,
          message: verify.message,
        }),
      }
    } catch {
      return {
        redirectUrl: this.vnpayService.buildFrontendPaymentReturnUrl(query, {
          isVerified: false,
          message: 'Invalid VNPay return payload.',
        }),
      }
    }
  }

  async handleVnpayIpn(query: Record<string, string>): Promise<IpnResponse> {
    let verify: VerifyIpnCall

    try {
      verify = await this.vnpayService.verifyIpnQuery(query)
    } catch {
      return IpnFailChecksum
    }

    if (!verify.isVerified) {
      return IpnFailChecksum
    }

    return this.reconcileVerifiedGatewayResult(verify, 'ipn')
  }

  private async reconcileVerifiedGatewayResult(
    verify: VerifyIpnCall,
    source: 'ipn' | 'return',
  ): Promise<IpnResponse> {
    const orderId = verify.vnp_TxnRef
    const transactionId = String(verify.vnp_TransactionNo ?? '')
    const transactionAmount = Number(verify.vnp_Amount)

    let order: Order
    try {
      order = await this.getById(orderId)
    } catch (error) {
      if (error instanceof NotFoundException) {
        return IpnOrderNotFound
      }
      throw error
    }

    if (order.totalAmount === undefined || transactionAmount !== order.totalAmount) {
      return IpnInvalidAmount
    }

    if (order.status === OrderStatus.CONFIRMED || order.paymentStatus === PaymentStatus.PAID) {
      return InpOrderAlreadyConfirmed
    }

    if (
      order.status === OrderStatus.EXPIRED &&
      order.paymentStatus === PaymentStatus.FAILED &&
      order.paymentTransactionId === transactionId &&
      order.paymentFailureReason?.startsWith(AUTO_REFUND_REASON)
    ) {
      return IpnSuccess
    }

    if (!verify.isSuccess) {
      return this.handleFailedIpn(order, verify.message)
    }

    if (this.isPaymentExpired(order)) {
      await this.releaseExpiredOrderReservation(order)
      const latestOrder = await this.getById(orderId)
      const latePaymentResult = await this.handleLatePaymentSuccess(latestOrder, verify)
      if (source === 'ipn') {
        this.vnpayService.logIpnResponse(orderId, latePaymentResult)
      }
      return latePaymentResult
    }

    if (order.status !== OrderStatus.RESERVED || order.paymentStatus !== PaymentStatus.PROCESSING) {
      return InpOrderAlreadyConfirmed
    }

    if (!order.paymentAttemptId) {
      this.logger.error(`Order ${orderId} is missing paymentAttemptId while processing VNPay IPN.`)
      return IpnUnknownError
    }

    try {
      await this.markPaymentSucceeded(orderId, order.paymentAttemptId, transactionId)
      this.logger.log(`VNPay ${source} confirmed payment for order ${orderId}.`)
      return IpnSuccess
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        const latestOrder = await this.getById(orderId)
        if (
          latestOrder.status === OrderStatus.CONFIRMED ||
          latestOrder.paymentStatus === PaymentStatus.PAID
        ) {
          return InpOrderAlreadyConfirmed
        }
        if (this.isPaymentExpired(latestOrder) || latestOrder.status === OrderStatus.EXPIRED) {
          return this.handleLatePaymentSuccess(latestOrder, verify)
        }
      }
      throw error
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

  async markExpiredPaymentRefunded(
    orderId: string,
    transactionId: string,
    failureReason: string,
  ): Promise<void> {
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.ordersTableName,
        Key: { orderId },
        UpdateExpression:
          'SET #status = :status, #paymentStatus = :paymentStatus, #paymentTransactionId = :paymentTransactionId, #paymentFailureReason = :paymentFailureReason, #failureReason = :failureReason, #updatedAt = :updatedAt',
        ConditionExpression: '#status <> :confirmed AND #paymentStatus <> :paid',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#paymentStatus': 'paymentStatus',
          '#paymentTransactionId': 'paymentTransactionId',
          '#paymentFailureReason': 'paymentFailureReason',
          '#failureReason': 'failureReason',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':confirmed': OrderStatus.CONFIRMED,
          ':paid': PaymentStatus.PAID,
          ':status': OrderStatus.EXPIRED,
          ':paymentStatus': PaymentStatus.FAILED,
          ':paymentTransactionId': transactionId,
          ':paymentFailureReason': failureReason,
          ':failureReason': failureReason,
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

  async failPendingOrderAndReleaseReservation(
    orderId: string,
    failureReason: string,
    items: ReservedInventoryItem[],
  ): Promise<void> {
    const inventoryItems = aggregateReservedItems(items)
    assertTransactionSize(inventoryItems)
    const timestamp = new Date().toISOString()

    await this.dynamoDbService.documentClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: this.ordersTableName,
              Key: { orderId },
              UpdateExpression:
                'SET #status = :status, #failureReason = :failureReason, #updatedAt = :updatedAt',
              ConditionExpression: '#status = :pending AND #paymentStatus = :notStarted',
              ExpressionAttributeNames: {
                '#status': 'status',
                '#paymentStatus': 'paymentStatus',
                '#failureReason': 'failureReason',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':pending': OrderStatus.PENDING,
                ':notStarted': PaymentStatus.NOT_STARTED,
                ':status': OrderStatus.FAILED,
                ':failureReason': failureReason,
                ':updatedAt': timestamp,
              },
            },
          },
          ...buildReleaseInventoryTransactItems(this.inventoryTableName, inventoryItems, timestamp),
        ],
      }),
    )
  }

  async expireReservationAndReleaseInventoryIfUnpaid(
    order: Order,
    items: ReservedInventoryItem[],
  ): Promise<boolean> {
    if (!order.paymentExpiresAt) {
      return false
    }

    const inventoryItems = aggregateReservedItems(items)
    if (inventoryItems.length === 0) {
      return false
    }

    assertTransactionSize(inventoryItems)
    const timestamp = new Date().toISOString()

    try {
      await this.dynamoDbService.documentClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.ordersTableName,
                Key: { orderId: order.orderId },
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
                  ':paymentExpiresAt': order.paymentExpiresAt,
                  ':status': OrderStatus.EXPIRED,
                  ':failureReason': PAYMENT_WINDOW_EXPIRED_REASON,
                  ':updatedAt': timestamp,
                },
              },
            },
            ...buildReleaseInventoryTransactItems(
              this.inventoryTableName,
              inventoryItems,
              timestamp,
            ),
          ],
        }),
      )
      return true
    } catch (error) {
      if (isConditionalCheckFailure(error) || isTransactionCanceled(error)) {
        return false
      }
      throw error
    }
  }

  isPaymentExpired(order: Order): boolean {
    return Boolean(order.paymentExpiresAt && order.paymentExpiresAt <= toEpochSeconds(Date.now()))
  }

  async releaseExpiredOrderReservation(order: Order): Promise<void> {
    if (order.status !== OrderStatus.RESERVED || !this.isPaymentExpired(order)) {
      return
    }

    const items = await this.findOrderItems(order.orderId)
    if (items.length === 0) {
      return
    }

    await this.expireReservationAndReleaseInventoryIfUnpaid(
      order,
      items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    )
  }

  private async handleFailedIpn(order: Order, failureReason: string): Promise<IpnResponse> {
    if (order.status !== OrderStatus.RESERVED || order.paymentStatus !== PaymentStatus.PROCESSING) {
      return IpnSuccess
    }

    if (!order.paymentAttemptId) {
      this.logger.error(
        `Order ${order.orderId} is missing paymentAttemptId while failing VNPay payment.`,
      )
      return IpnUnknownError
    }

    try {
      await this.markPaymentFailed(order.orderId, order.paymentAttemptId, failureReason)
      return IpnSuccess
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        return IpnSuccess
      }
      throw error
    }
  }

  private async handleLatePaymentSuccess(
    order: Order,
    verify: VerifyIpnCall,
  ): Promise<IpnResponse> {
    const paymentRequestedAt = order.paymentRequestedAt
    const transactionNo = Number(verify.vnp_TransactionNo)

    if (!paymentRequestedAt || !Number.isFinite(transactionNo)) {
      this.logger.error(
        `Cannot auto-refund late VNPay payment for order ${order.orderId}: missing paymentRequestedAt or transactionNo.`,
      )
      return IpnUnknownError
    }

    const transactionDate = new Date(paymentRequestedAt)
    const orderInfo = buildPaymentOrderInfo(order.orderId)

    try {
      const queryResult = await this.vnpayService.queryOrderPayment({
        clientIp: this.vnpayService.getApiIpAddress(),
        createDate: transactionDate,
        orderId: order.orderId,
        orderInfo,
        transactionDate,
        transactionNo,
      })

      if (!queryResult.isVerified || !queryResult.isSuccess) {
        this.logger.error(
          `VNPay queryDr verification failed for expired order ${order.orderId}: ${queryResult.message}`,
        )
        return IpnUnknownError
      }

      const refundResult = await this.vnpayService.refundOrderPayment({
        amount: order.totalAmount ?? Number(verify.vnp_Amount),
        clientIp: this.vnpayService.getApiIpAddress(),
        createBy: AUTO_REFUND_CREATE_BY,
        createDate: transactionDate,
        orderId: order.orderId,
        orderInfo,
        refundReason: buildAutoRefundReason(order.orderId),
        transactionDate,
        transactionNo: Number(queryResult.vnp_TransactionNo ?? transactionNo),
      })

      if (!refundResult.isVerified || !refundResult.isSuccess) {
        this.logger.error(
          `VNPay refund failed for expired order ${order.orderId}: ${refundResult.message}`,
        )
        return IpnUnknownError
      }

      const autoRefundReason = `${AUTO_REFUND_REASON} Refund reference: ${refundResult.vnp_ResponseId}.`
      await this.markExpiredPaymentRefunded(
        order.orderId,
        String(verify.vnp_TransactionNo),
        autoRefundReason,
      )
      return IpnSuccess
    } catch (error) {
      this.logger.error(
        `Failed to auto-refund late VNPay payment for order ${order.orderId}.`,
        error,
      )
      return IpnUnknownError
    }
  }
}

function toEpochSeconds(timestampMs: number): number {
  return Math.floor(timestampMs / 1000)
}

function buildPaymentOrderInfo(orderId: string): string {
  return `Thanh toan don hang ${orderId}`
}

function buildAutoRefundReason(orderId: string): string {
  return `Hoan tien tu dong cho don hang ${orderId} do het han giu hang`
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConditionalCheckFailedException'
  )
}

function isTransactionCanceled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TransactionCanceledException'
  )
}

function aggregateReservedItems(items: ReservedInventoryItem[]): ReservedInventoryItem[] {
  const quantityByProductId = new Map<string, number>()

  for (const item of items) {
    quantityByProductId.set(
      item.productId,
      (quantityByProductId.get(item.productId) ?? 0) + item.quantity,
    )
  }

  return [...quantityByProductId.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }))
}

function assertTransactionSize(items: ReservedInventoryItem[]): void {
  if (items.length > 99) {
    throw new BadRequestException(
      'Cannot release reservations for orders with more than 99 unique products.',
    )
  }
}

function buildReleaseInventoryTransactItems(
  inventoryTableName: string,
  items: ReservedInventoryItem[],
  timestamp: string,
) {
  return items.map((item) => ({
    Update: {
      TableName: inventoryTableName,
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
        ':updatedAt': timestamp,
      },
    },
  }))
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
