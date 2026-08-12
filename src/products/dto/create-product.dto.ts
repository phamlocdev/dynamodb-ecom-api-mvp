import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ProductStatus } from '../product-status.enum'
import { CreateProductInput } from '../inputs/create-product.input'

export class CreateProductDto extends CreateProductInput {
  @ApiProperty({ example: 'Tai nghe Bluetooth chá»‘ng á»“n' })
  declare name: string

  @ApiProperty({ example: 'Tai nghe khÃ´ng dÃ¢y, pin 30 giá», há»— trá»£ chá»‘ng á»“n chá»§ Ä‘á»™ng.' })
  declare description: string

  @ApiProperty({ example: 'electronics' })
  declare categoryId: string

  @ApiProperty({ example: 1299000, description: 'Integer VND amount' })
  declare price: number

  @ApiPropertyOptional({ example: 'https://images.example.com/headphones.jpg' })
  declare imageUrl?: string

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  declare status?: ProductStatus
}
