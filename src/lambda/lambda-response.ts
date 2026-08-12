import { AppError, isAppError } from '../common/errors/app-error'

export interface LambdaSuccessResponse<T> {
  success: true
  data: T
}

export interface LambdaErrorResponse {
  success: false
  error: {
    code: AppError['code'] | 'INTERNAL_ERROR'
    message: string
    details?: string[]
  }
}

export type LambdaResponse<T> = LambdaSuccessResponse<T> | LambdaErrorResponse

export function success<T>(data: T): LambdaSuccessResponse<T> {
  return { success: true, data }
}

export function failure(error: unknown): LambdaErrorResponse {
  if (isAppError(error)) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details?.length ? { details: error.details } : {}),
      },
    }
  }

  const message = error instanceof Error ? error.message : 'Unexpected error.'
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  }
}
