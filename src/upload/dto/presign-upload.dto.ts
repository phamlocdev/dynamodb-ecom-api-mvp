import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export enum UploadTarget {
  AVATAR = 'avatar',
  PRODUCT_IMAGE = 'product-image',
}

export const ALLOWED_PRODUCT_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export class PresignUploadFileDto {
  @ApiProperty({ example: 'front.webp' })
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  fileName!: string

  @ApiProperty({ enum: ALLOWED_PRODUCT_IMAGE_CONTENT_TYPES, example: 'image/webp' })
  @Transform(trimString)
  @IsIn(ALLOWED_PRODUCT_IMAGE_CONTENT_TYPES)
  contentType!: (typeof ALLOWED_PRODUCT_IMAGE_CONTENT_TYPES)[number]

  @ApiProperty({ example: 123456 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number
}

export class PresignUploadRequestDto {
  @ApiProperty({ enum: UploadTarget, example: UploadTarget.PRODUCT_IMAGE })
  @IsEnum(UploadTarget)
  target!: UploadTarget

  @ApiProperty({ type: [PresignUploadFileDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PresignUploadFileDto)
  files!: PresignUploadFileDto[]
}

export class PresignedUploadItemDto {
  @ApiProperty({ example: 'products/7b8c/a1f2-front.webp' })
  imageKey!: string

  @ApiProperty({ example: 'http://localhost.localstack.cloud:4566/ecommerce-media-local' })
  url!: string

  @ApiProperty({
    example: {
      key: 'products/7b8c/a1f2-front.webp',
      policy: '...',
      'x-amz-signature': '...',
    },
  })
  fields!: Record<string, string>
}

export class PresignUploadResponseDto {
  @ApiProperty({ example: 900 })
  expiresInSeconds!: number

  @ApiProperty({ type: [PresignedUploadItemDto] })
  items!: PresignedUploadItemDto[]
}
