import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator'

export class SetInventoryDto {
  @ApiProperty({ example: 'abc-123', description: 'Product ID to set stock for' })
  @IsString()
  @IsNotEmpty()
  productId!: string

  @ApiProperty({ example: 100, description: 'Total stock quantity to set' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number
}
