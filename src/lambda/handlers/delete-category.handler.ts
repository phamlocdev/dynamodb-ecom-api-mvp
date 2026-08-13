import { LambdaResponse, failure, success } from '../lambda-response'
import { AppError } from '../../common/errors/app-error'
import { createCategoriesLambdaCore } from '../categories-lambda.factory'

interface DeleteCategoryEvent {
  categoryId?: string
}

export async function handler(
  event: DeleteCategoryEvent,
): Promise<LambdaResponse<{ categoryId: string; deleted: true }>> {
  try {
    if (!event.categoryId) {
      throw new AppError('VALIDATION_ERROR', 'categoryId is required.')
    }

    await createCategoriesLambdaCore().remove(event.categoryId)
    return success({ categoryId: event.categoryId, deleted: true })
  } catch (error) {
    return failure(error)
  }
}
