import { ApiPropertyOptional } from '@nestjs/swagger'
import { ProductStatus } from '../product-status.enum'
import { ListProductsQueryInput } from '../inputs/list-products-query.input'

export class ListProductsQueryDto extends ListProductsQueryInput {
  @ApiPropertyOptional({
    example: 'electronics',
    description: 'Return only products that reference this categoryId.',
  })
  declare categoryId?: string

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Return only products with this status.',
  })
  declare status?: ProductStatus

  @ApiPropertyOptional({
    example: 100000,
    description: 'Minimum product price in VND.',
  })
  declare minPrice?: number

  @ApiPropertyOptional({
    example: 500000,
    description: 'Maximum product price in VND.',
  })
  declare maxPrice?: number

  @ApiPropertyOptional({
    example: '2026-08-01T00:00:00.000Z',
    description: 'Return products updated at or after this ISO timestamp.',
  })
  declare updatedFrom?: string

  @ApiPropertyOptional({
    example: '2026-08-31T23:59:59.999Z',
    description: 'Return products updated at or before this ISO timestamp.',
  })
  declare updatedTo?: string

  @ApiPropertyOptional({
    example: 'Bluetooth',
    description: 'Case-sensitive substring search across product name and description.',
  })
  declare q?: string
}
