import { Transform, Type } from 'class-transformer'
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { ProductStatus } from '../product-status.enum'
import { trimString } from './shared-input.helpers'

export class CreateProductInput {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  categoryId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  price!: number

  @IsOptional()
  @Transform(trimString)
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus
}
