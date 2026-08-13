import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { PageSize } from './pagination.constants'

export type PaginationResource = 'products' | 'categories'
export type CursorKey = Record<string, unknown> | null
export type CursorScope = Record<string, string>

export interface PaginationState {
  limit: PageSize
  startKey: CursorKey
  history: CursorKey[]
  scope: CursorScope
}

export interface PaginatedResponse<T> {
  items: T[]
  previousCursor: string | null
  nextCursor: string | null
  limit: PageSize
  currentPage: number
  scannedCount?: number
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  items!: T[]

  @ApiPropertyOptional({ nullable: true })
  previousCursor!: string | null

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null

  @ApiProperty({ example: 10 })
  limit!: number

  @ApiProperty({ example: 1 })
  currentPage!: number

  @ApiPropertyOptional({ example: 25 })
  scannedCount?: number
}
