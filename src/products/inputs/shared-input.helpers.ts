import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

export const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

@ValidatorConstraint({ name: 'isGreaterThanOrEqualTo', async: false })
export class IsGreaterThanOrEqualToConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints as [string]
    const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName]

    if (value === undefined || relatedValue === undefined) {
      return true
    }

    return typeof value === 'number' && typeof relatedValue === 'number' && value >= relatedValue
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints as [string]
    return `${args.property} must be greater than or equal to ${relatedPropertyName}.`
  }
}

@ValidatorConstraint({ name: 'isDateGreaterThanOrEqualTo', async: false })
export class IsDateGreaterThanOrEqualToConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints as [string]
    const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName]

    if (value === undefined || relatedValue === undefined) {
      return true
    }

    const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN
    const relatedTimestamp =
      typeof relatedValue === 'string' ? Date.parse(relatedValue) : Number.NaN

    return (
      Number.isFinite(timestamp) &&
      Number.isFinite(relatedTimestamp) &&
      timestamp >= relatedTimestamp
    )
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints as [string]
    return `${args.property} must be greater than or equal to ${relatedPropertyName}.`
  }
}
