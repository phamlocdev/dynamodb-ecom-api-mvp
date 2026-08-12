import { PartialType } from '@nestjs/mapped-types'
import { CreateProductInput } from './create-product.input'

export class UpdateProductInput extends PartialType(CreateProductInput) {}
