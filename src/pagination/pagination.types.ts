import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageSize } from './pagination-query.dto';

export type PaginationResource = 'products' | 'categories';
export type CursorKey = Record<string, unknown> | null;

export interface PaginationState {
  limit: PageSize;
  startKey: CursorKey;
  history: CursorKey[];
}

export interface PaginatedResponse<T> {
  items: T[];
  previousCursor: string | null;
  nextCursor: string | null;
  limit: PageSize;
  currentPage: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  items!: T[];

  @ApiPropertyOptional({ nullable: true })
  previousCursor!: string | null;

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 1 })
  currentPage!: number;
}
