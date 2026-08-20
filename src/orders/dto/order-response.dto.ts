import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PaginatedResponseDto } from '../../pagination/pagination.types'
import { OrderStatus } from '../order-status.enum'
import { PaymentStatus } from '../../payments/payment-status.enum'

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string

  @ApiProperty()
  customerId!: string

  @ApiPropertyOptional()
  customerEmail?: string

  @ApiPropertyOptional()
  customerName?: string

  @ApiProperty({ format: 'uuid' })
  cartId!: string

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus

  @ApiProperty()
  createdAt!: string

  @ApiProperty()
  updatedAt!: string

  @ApiPropertyOptional()
  reservedAt?: string

  @ApiPropertyOptional()
  paymentRequestedAt?: string

  @ApiPropertyOptional()
  paidAt?: string

  @ApiPropertyOptional()
  paymentTransactionId?: string

  @ApiPropertyOptional()
  paymentFailureReason?: string

  @ApiPropertyOptional()
  failureReason?: string

  @ApiPropertyOptional()
  totalAmount?: number
}

export class OrderItemResponseDto {
  @ApiProperty()
  lineId!: string

  @ApiProperty({ format: 'uuid' })
  productId!: string

  @ApiProperty()
  productName!: string

  @ApiPropertyOptional()
  imageUrl?: string

  @ApiProperty()
  unitPrice!: number

  @ApiProperty()
  quantity!: number

  @ApiProperty()
  lineTotal!: number

  @ApiProperty()
  createdAt!: string
}

export class OrderDetailsResponseDto extends OrderResponseDto {
  @ApiProperty({ type: OrderItemResponseDto, isArray: true })
  items!: OrderItemResponseDto[]
}

export class PlaceOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PENDING })
  status!: OrderStatus
}

export class TriggerPaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PROCESSING })
  paymentStatus!: PaymentStatus
}

export class PaginatedOrderResponseDto extends PaginatedResponseDto<OrderResponseDto> {
  @ApiProperty({ type: OrderResponseDto, isArray: true })
  declare items: OrderResponseDto[]
}
