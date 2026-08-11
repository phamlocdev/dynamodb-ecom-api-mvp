import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../product-status.enum';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductDto {
  @ApiProperty({ example: 'Tai nghe Bluetooth chống ồn' })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Tai nghe không dây, pin 30 giờ, hỗ trợ chống ồn chủ động.' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ example: 'electronics' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  categoryId!: string;

  @ApiProperty({ example: 1299000, description: 'Integer VND amount' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  price!: number;

  @ApiPropertyOptional({ example: 'https://images.example.com/headphones.jpg' })
  @IsOptional()
  @Transform(trimString)
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
