import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: 'electronics' })
  categoryId!: string;

  @ApiProperty({ example: 'Thiết bị điện tử' })
  name!: string;

  @ApiPropertyOptional({ example: 'Thiết bị công nghệ và phụ kiện.' })
  description?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
