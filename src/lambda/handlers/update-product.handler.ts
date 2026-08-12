import { LambdaResponse, failure, success } from '../lambda-response'
import { AppError } from '../../common/errors/app-error'
import { validateInput } from '../../common/validation/validate-input'
import { createProductsLambdaCore } from '../products-lambda.factory'
import { Product } from '../../products/product.types'
import { UpdateProductInput } from '../../products/inputs/update-product.input'

interface UpdateProductEvent {
  productId?: string
  payload?: unknown
}

export async function handler(event: UpdateProductEvent): Promise<LambdaResponse<Product>> {
  try {
    if (!event.productId) {
      throw new AppError('VALIDATION_ERROR', 'productId is required.')
    }

    const input = await validateInput(UpdateProductInput, event.payload ?? {})
    const product = await createProductsLambdaCore().update(event.productId, input)
    return success(product)
  } catch (error) {
    return failure(error)
  }
}
