import { LambdaResponse, failure, success } from '../lambda-response'
import { AppError } from '../../common/errors/app-error'
import { createCategoriesLambdaCore } from '../categories-lambda.factory'
import type { Category } from '../../categories/category.types'

interface GetCategoryEvent {
  categoryId?: string
}

export async function handler(event: GetCategoryEvent): Promise<LambdaResponse<Category>> {
  try {
    if (!event.categoryId) {
      throw new AppError('VALIDATION_ERROR', 'categoryId is required.')
    }

    const category = await createCategoriesLambdaCore().findOne(event.categoryId)
    return success(category)
  } catch (error) {
    return failure(error)
  }
}
