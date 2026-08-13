import { Type } from 'class-transformer'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { PAGE_SIZE_OPTIONS, type PageSize } from './pagination.constants'

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZE_OPTIONS)
  limit?: PageSize

  @IsOptional()
  @IsString()
  cursor?: string
}
