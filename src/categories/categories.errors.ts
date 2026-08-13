import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { AppError } from '../common/errors/app-error'

export function toNestCategoryException(error: unknown): Error {
  if (!(error instanceof AppError)) {
    return error instanceof Error ? error : new InternalServerErrorException('Unexpected error.')
  }

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return new BadRequestException(error.details?.length ? error.details : error.message)
    case 'NOT_FOUND':
      return new NotFoundException(error.message)
    case 'CONFLICT':
      return new ConflictException(error.message)
    default:
      return new InternalServerErrorException(error.message)
  }
}
