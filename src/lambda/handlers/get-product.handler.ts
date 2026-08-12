import { LambdaResponse, failure, success } from '../lambda-response'
import { AppError } from '../../common/errors/app-error'
import { createProductsLambdaCore } from '../products-lambda.factory'
import { Product } from '../../products/product.types'

interface GetProductEvent {
  productId?: string
}

export async function handler(event: GetProductEvent): Promise<LambdaResponse<Product>> {
  try {
    if (!event.productId) {
      throw new AppError('VALIDATION_ERROR', 'productId is required.')
    }

    const product = await createProductsLambdaCore().findOne(event.productId)
    return success(product)
  } catch (error) {
    return failure(error)
  }
}
