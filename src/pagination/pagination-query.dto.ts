import { Type } from 'class-transformer'
import { IsIn, IsOptional, IsString } from 'class-validator'

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 10

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZE_OPTIONS)
  limit?: PageSize

  @IsOptional()
  @IsString()
  cursor?: string
}
