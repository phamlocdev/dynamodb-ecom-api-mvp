import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator'

export class AddCartItemDto {
  @ApiProperty({ example: 'abc-uuid-123', description: 'ID of the product to add' })
  @IsString()
  @IsNotEmpty()
  productId!: string

  @ApiProperty({ example: 2, description: 'Quantity to add (upserts if already in cart)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number
}
