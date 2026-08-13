import { Transform, Type } from 'class-transformer'
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { ProductStatus } from '../product-status.enum'
import { trimString } from './shared-input.helpers'

export class UpdateProductInput {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  categoryId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  price?: number

  @IsOptional()
  @Transform(trimString)
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus
}
