import { BadRequestException, PipeTransform } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { ValidationError, validate } from 'class-validator'

type DtoClass<TValue extends object> = new () => TValue

export class DtoValidationPipe<TValue extends object> implements PipeTransform {
  constructor(private readonly dtoClass: DtoClass<TValue>) {}

  async transform(value: unknown): Promise<TValue> {
    const instance = plainToInstance(this.dtoClass, value ?? {})
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    })

    if (errors.length > 0) {
      throw new BadRequestException(flattenValidationMessages(errors))
    }

    return instance
  }
}

function flattenValidationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenValidationMessages(error.children ?? []),
  ])
}
