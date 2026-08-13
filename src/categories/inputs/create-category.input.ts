import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { trimString } from './shared-input.helpers'

export class CreateCategoryInput {
  @Transform(trimString)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(64)
  categoryId!: string

  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description?: string
}
