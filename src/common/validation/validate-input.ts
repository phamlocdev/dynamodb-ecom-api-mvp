import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { ValidationError, validate } from 'class-validator'
import { AppError } from '../errors/app-error'

interface ClassConstructor<T> {
  new (): T
}

export async function validateInput<T>(
  klass: ClassConstructor<T>,
  payload: unknown,
): Promise<T> {
  const instance = plainToInstance(klass, payload)
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  })

  if (errors.length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Input validation failed.',
      flattenValidationErrors(errors),
    )
  }

  return instance
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath?: string,
): string[] {
  const messages: string[] = []

  for (const error of errors) {
    const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property

    if (error.constraints) {
      messages.push(...Object.values(error.constraints).map((message) => `${currentPath}: ${message}`))
    }

    if (error.children && error.children.length > 0) {
      messages.push(...flattenValidationErrors(error.children, currentPath))
    }
  }

  return messages
}
