import { LambdaResponse, failure, success } from '../lambda-response'
import { AppError } from '../../common/errors/app-error'
import { createProductsLambdaCore } from '../products-lambda.factory'

interface DeleteProductEvent {
  productId?: string
}

export async function handler(
  event: DeleteProductEvent,
): Promise<LambdaResponse<{ productId: string; deleted: true }>> {
  try {
    if (!event.productId) {
      throw new AppError('VALIDATION_ERROR', 'productId is required.')
    }

    await createProductsLambdaCore().remove(event.productId)
    return success({ productId: event.productId, deleted: true })
  } catch (error) {
    return failure(error)
  }
}
