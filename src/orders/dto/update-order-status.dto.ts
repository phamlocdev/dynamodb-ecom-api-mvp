import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import { OrderStatus } from '../order-status.enum'

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: [OrderStatus.SHIPPED], example: OrderStatus.SHIPPED })
  @IsIn([OrderStatus.SHIPPED])
  status!: OrderStatus.SHIPPED
}
