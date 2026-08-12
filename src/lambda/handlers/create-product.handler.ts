import { LambdaResponse, failure, success } from '../lambda-response'
import { validateInput } from '../../common/validation/validate-input'
import { CreateProductInput } from '../../products/inputs/create-product.input'
import { createProductsLambdaCore } from '../products-lambda.factory'
import { Product } from '../../products/product.types'

interface CreateProductEvent {
  payload?: unknown
}

export async function handler(event: CreateProductEvent): Promise<LambdaResponse<Product>> {
  try {
    const input = await validateInput(CreateProductInput, event.payload ?? {})
    const product = await createProductsLambdaCore().create(input)
    return success(product)
  } catch (error) {
    return failure(error)
  }
}
