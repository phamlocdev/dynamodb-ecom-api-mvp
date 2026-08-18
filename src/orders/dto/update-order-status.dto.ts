import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional } from 'class-validator'
import { OrderStatus } from '../order-status.enum'

export class UpdateOrderStatusDto {
  @ApiPropertyOptional({
    enum: [OrderStatus.PROCESSING, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    description: 'New order status. Only PROCESSING, DELIVERED, or CANCELLED allowed via this endpoint.',
  })
  @IsEnum([OrderStatus.PROCESSING, OrderStatus.DELIVERED, OrderStatus.CANCELLED])
  status!: OrderStatus.PROCESSING | OrderStatus.DELIVERED | OrderStatus.CANCELLED
}
