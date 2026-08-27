import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { AuthenticatedUser } from '../auth/auth.types'
import {
  commerceMapper,
  fromCartItemRecord,
  fromCartRecord,
} from '../dynamodb/commerce-table.mappers'
import { commerceKeys } from '../dynamodb/commerce-table.keys'
import { CartItemRecord, CartRecord } from '../dynamodb/commerce-table.types'
import { CommerceTableService } from '../dynamodb/commerce-table.service'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { CartStatus } from './cart-status.enum'
import { Cart, CartDetails, CartItem } from './cart.types'
import { CreateCartDto } from './dto/create-cart.dto'
import { UpdateCartItemDto } from './dto/update-cart-item.dto'
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto'

const DEFAULT_TTL_DAYS = 30

@Injectable()
export class CartsService {
  private readonly logger = new Logger(CartsService.name)
  private readonly cartsTableName: string
  private readonly cartItemsTableName: string

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(CommerceTableService)
    private readonly commerceTableService: CommerceTableService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.cartsTableName = configService.get<string>('CARTS_TABLE') ?? 'carts'
    this.cartItemsTableName = configService.get<string>('CART_ITEMS_TABLE') ?? 'cart-items'
  }

  async create(user: AuthenticatedUser, dto: CreateCartDto): Promise<Cart> {
    const timestamp = new Date().toISOString()
    const cart: Cart = {
      customerId: user.sub,
      cartId: randomUUID(),
      status: CartStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: toEpochSeconds(
        Date.now() + (dto.ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000,
      ),
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.cartsTableName,
        Item: cart,
        ConditionExpression: 'attribute_not_exists(#customerId) AND attribute_not_exists(#cartId)',
        ExpressionAttributeNames: {
          '#customerId': 'customerId',
          '#cartId': 'cartId',
        },
      }),
    )
    await this.mirrorCart(cart)

    return cart
  }

  async findAllForCustomer(user: AuthenticatedUser): Promise<Cart[]> {
    const commerceResponse = await this.commerceTableService.query({
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :cartPrefix)',
      ExpressionAttributeNames: {
        '#pk': 'PK',
        '#sk': 'SK',
      },
      ExpressionAttributeValues: {
        ':pk': `CUSTOMER#${user.sub}`,
        ':cartPrefix': 'CART#',
      },
      ScanIndexForward: false,
    })

    if ((commerceResponse.Items ?? []).length > 0) {
      return (commerceResponse.Items ?? [])
        .map((item) => fromCartRecord(item as CartRecord))
        .map((cart) => this.withDerivedStatus(cart))
    }

    const response = await this.dynamoDbService.documentClient.send(
      new QueryCommand({
        TableName: this.cartsTableName,
        KeyConditionExpression: '#customerId = :customerId',
        ExpressionAttributeNames: { '#customerId': 'customerId' },
        ExpressionAttributeValues: { ':customerId': user.sub },
        ScanIndexForward: false,
      }),
    )

    return ((response.Items ?? []) as Cart[]).map((cart) => this.withDerivedStatus(cart))
  }

  async findOneForCustomer(user: AuthenticatedUser, cartId: string): Promise<CartDetails> {
    const cart = await this.getOwnedCartOrThrow(user.sub, cartId)
    const items = await this.findItems(cartId)
    return {
      ...cart,
      items,
    }
  }

  async addItem(
    user: AuthenticatedUser,
    cartId: string,
    dto: UpsertCartItemDto,
  ): Promise<CartDetails> {
    const cart = await this.getOwnedCartOrThrow(user.sub, cartId)
    ensureCartUsable(cart)

    const timestamp = new Date().toISOString()
    const item: CartItem = {
      cartId,
      customerId: user.sub,
      productId: dto.productId,
      quantity: dto.quantity,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.cartItemsTableName,
        Item: item,
      }),
    )
    await this.upsertCartItemMirror(item)

    await this.touchCart(cart)
    return this.findOneForCustomer(user, cartId)
  }

  async updateItem(
    user: AuthenticatedUser,
    cartId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartDetails> {
    const cart = await this.getOwnedCartOrThrow(user.sub, cartId)
    ensureCartUsable(cart)
    const existingItems = await this.findItems(cartId)
    const existingItem = existingItems.find((item) => item.productId === productId)

    try {
      await this.dynamoDbService.documentClient.send(
        new UpdateCommand({
          TableName: this.cartItemsTableName,
          Key: { cartId, productId },
          UpdateExpression: 'SET #quantity = :quantity, #updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(#productId)',
          ExpressionAttributeNames: {
            '#productId': 'productId',
            '#quantity': 'quantity',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':quantity': dto.quantity,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Product ${productId} is not in cart ${cartId}.`)
      }
      throw error
    }

    await this.upsertCartItemMirror({
      cartId,
      customerId: user.sub,
      productId,
      quantity: dto.quantity,
      createdAt: existingItem?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await this.touchCart(cart)
    return this.findOneForCustomer(user, cartId)
  }

  async removeItem(user: AuthenticatedUser, cartId: string, productId: string): Promise<void> {
    const cart = await this.getOwnedCartOrThrow(user.sub, cartId)
    ensureCartUsable(cart)

    try {
      await this.dynamoDbService.documentClient.send(
        new DeleteCommand({
          TableName: this.cartItemsTableName,
          Key: { cartId, productId },
          ConditionExpression: 'attribute_exists(#productId)',
          ExpressionAttributeNames: { '#productId': 'productId' },
        }),
      )
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new NotFoundException(`Product ${productId} is not in cart ${cartId}.`)
      }
      throw error
    }

    await this.deleteCartItemMirror(cartId, productId)

    await this.touchCart(cart)
  }

  async getOwnedCartOrThrow(customerId: string, cartId: string): Promise<Cart> {
    const commerceCart = await this.commerceTableService.get<CartRecord>(
      commerceKeys.cart(customerId, cartId),
    )
    if (commerceCart) {
      return this.withDerivedStatus(fromCartRecord(commerceCart))
    }

    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.cartsTableName,
        Key: { customerId, cartId },
      }),
    )

    if (!response.Item) {
      throw new NotFoundException(`Cart ${cartId} was not found.`)
    }

    const cart = this.withDerivedStatus(response.Item as Cart)
    if (cart.customerId !== customerId) {
      throw new UnauthorizedException('You do not have access to this cart.')
    }

    return cart
  }

  async getCartItems(cartId: string): Promise<CartItem[]> {
    return this.findItems(cartId)
  }

  async markExpired(cart: Cart): Promise<void> {
    if (cart.status === CartStatus.EXPIRED) {
      return
    }

    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.cartsTableName,
        Key: { customerId: cart.customerId, cartId: cart.cartId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': CartStatus.EXPIRED,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    )
    await this.upsertCartMirror({
      ...cart,
      status: CartStatus.EXPIRED,
      updatedAt: new Date().toISOString(),
    })
  }

  private async findItems(cartId: string): Promise<CartItem[]> {
    const commerceResponse = await this.commerceTableService.query({
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :itemPrefix)',
      ExpressionAttributeNames: {
        '#pk': 'PK',
        '#sk': 'SK',
      },
      ExpressionAttributeValues: {
        ':pk': `CART#${cartId}`,
        ':itemPrefix': 'ITEM#',
      },
    })

    if ((commerceResponse.Items ?? []).length > 0) {
      return (commerceResponse.Items ?? []).map((item) =>
        fromCartItemRecord(item as CartItemRecord),
      )
    }

    const response = await this.dynamoDbService.documentClient.send(
      new QueryCommand({
        TableName: this.cartItemsTableName,
        KeyConditionExpression: '#cartId = :cartId',
        ExpressionAttributeNames: { '#cartId': 'cartId' },
        ExpressionAttributeValues: { ':cartId': cartId },
      }),
    )

    return (response.Items ?? []) as CartItem[]
  }

  private async touchCart(cart: Cart): Promise<void> {
    const updatedCart = {
      ...cart,
      status: this.withDerivedStatus(cart).status,
      updatedAt: new Date().toISOString(),
    }
    await this.dynamoDbService.documentClient.send(
      new UpdateCommand({
        TableName: this.cartsTableName,
        Key: { customerId: cart.customerId, cartId: cart.cartId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': updatedCart.status,
          ':updatedAt': updatedCart.updatedAt,
        },
      }),
    )
    await this.upsertCartMirror(updatedCart)
  }

  private withDerivedStatus(cart: Cart): Cart {
    if (cart.expiresAt <= toEpochSeconds(Date.now())) {
      return {
        ...cart,
        status: CartStatus.EXPIRED,
      }
    }

    if (cart.status === CartStatus.EXPIRED) {
      return cart
    }

    return {
      ...cart,
      status: CartStatus.ACTIVE,
    }
  }

  private async mirrorCart(cart: Cart): Promise<void> {
    try {
      await this.commerceTableService.put(
        commerceMapper.toCartRecord(cart),
        'attribute_not_exists(#pk) AND attribute_not_exists(#sk)',
        { '#pk': 'PK', '#sk': 'SK' },
      )
    } catch {
      this.logger.warn(`Failed to mirror cart ${cart.cartId} into commerce table.`)
    }
  }

  private async upsertCartMirror(cart: Cart): Promise<void> {
    try {
      await this.commerceTableService.put(commerceMapper.toCartRecord(cart))
    } catch {
      this.logger.warn(`Failed to upsert cart ${cart.cartId} into commerce table.`)
    }
  }

  private async upsertCartItemMirror(item: CartItem): Promise<void> {
    try {
      await this.commerceTableService.put(commerceMapper.toCartItemRecord(item))
    } catch {
      this.logger.warn(
        `Failed to upsert cart item ${item.productId} for cart ${item.cartId} into commerce table.`,
      )
    }
  }

  private async deleteCartItemMirror(cartId: string, productId: string): Promise<void> {
    try {
      await this.commerceTableService.delete(commerceKeys.cartItem(cartId, productId))
    } catch {
      this.logger.warn(
        `Failed to delete cart item ${productId} for cart ${cartId} from commerce table.`,
      )
    }
  }
}

function ensureCartUsable(cart: Cart): void {
  if (cart.expiresAt <= toEpochSeconds(Date.now()) || cart.status === CartStatus.EXPIRED) {
    throw new BadRequestException(`Cart ${cart.cartId} has expired.`)
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

function toEpochSeconds(value: number): number {
  return Math.floor(value / 1000)
}
