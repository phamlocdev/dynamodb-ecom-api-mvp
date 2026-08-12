import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  PageSize,
  PaginationQueryDto,
} from './pagination-query.dto';
import {
  CursorKey,
  PaginatedResponse,
  PaginationResource,
  PaginationState,
} from './pagination.types';

interface CursorPayload {
  resource: PaginationResource;
  limit: PageSize;
  startKey: CursorKey;
  history: CursorKey[];
}

export function resolvePaginationState(
  resource: PaginationResource,
  query: PaginationQueryDto,
): PaginationState {
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;

  if (!query.cursor) {
    return { limit, startKey: null, history: [] };
  }

  const payload = decodeCursor(query.cursor);
  if (payload.resource !== resource) {
    throw new BadRequestException('Cursor does not belong to this resource.');
  }
  if (payload.limit !== limit) {
    throw new BadRequestException('Cursor limit does not match the requested limit.');
  }

  return {
    limit,
    startKey: payload.startKey,
    history: payload.history,
  };
}

export function toPaginatedResponse<T>(
  resource: PaginationResource,
  state: PaginationState,
  items: T[],
  lastEvaluatedKey?: Record<string, unknown>,
): PaginatedResponse<T> {
  return {
    items,
    previousCursor: createPreviousCursor(resource, state),
    nextCursor: createNextCursor(resource, state, lastEvaluatedKey),
    limit: state.limit,
    currentPage: state.history.length + 1,
  };
}

function createPreviousCursor(
  resource: PaginationResource,
  state: PaginationState,
): string | null {
  if (state.history.length === 0) {
    return null;
  }

  const previousHistory = state.history.slice(0, -1);
  const previousStartKey = state.history[state.history.length - 1] ?? null;

  return encodeCursor({
    resource,
    limit: state.limit,
    startKey: previousStartKey,
    history: previousHistory,
  });
}

function createNextCursor(
  resource: PaginationResource,
  state: PaginationState,
  lastEvaluatedKey?: Record<string, unknown>,
): string | null {
  if (!lastEvaluatedKey) {
    return null;
  }

  return encodeCursor({
    resource,
    limit: state.limit,
    startKey: lastEvaluatedKey,
    history: [...state.history, state.startKey],
  });
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (isCursorPayload(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to the common BadRequestException below.
  }

  throw new BadRequestException('Cursor is malformed.');
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.resource === 'products' || value.resource === 'categories') &&
    isPageSize(value.limit) &&
    isCursorKey(value.startKey) &&
    Array.isArray(value.history) &&
    value.history.every(isCursorKey)
  );
}

function isPageSize(value: unknown): value is PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize);
}

function isCursorKey(value: unknown): value is CursorKey {
  return value === null || isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
