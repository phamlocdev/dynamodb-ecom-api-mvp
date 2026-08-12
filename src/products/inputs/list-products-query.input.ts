import { Transform, Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
} from 'class-validator'
import { PaginationQueryDto } from '../../pagination/pagination-query.dto'
import { ProductStatus } from '../product-status.enum'
import {
  IsDateGreaterThanOrEqualToConstraint,
  IsGreaterThanOrEqualToConstraint,
  trimString,
} from './shared-input.helpers'

export class ListProductsQueryInput extends PaginationQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  categoryId?: string

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minPrice?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Validate(IsGreaterThanOrEqualToConstraint, ['minPrice'])
  maxPrice?: number

  @IsOptional()
  @Transform(trimString)
  @IsDateString()
  updatedFrom?: string

  @IsOptional()
  @Transform(trimString)
  @IsDateString()
  @Validate(IsDateGreaterThanOrEqualToConstraint, ['updatedFrom'])
  updatedTo?: string

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  q?: string
}
