import { LambdaResponse, failure, success } from '../lambda-response'
import { AppError } from '../../common/errors/app-error'
import { validateInput } from '../../common/validation/validate-input'
import { createCategoriesLambdaCore } from '../categories-lambda.factory'
import { Category } from '../../categories/category.types'
import { UpdateCategoryInput } from '../../categories/inputs/update-category.input'

interface UpdateCategoryEvent {
  categoryId?: string
  payload?: unknown
}

export async function handler(
  event: UpdateCategoryEvent,
): Promise<LambdaResponse<Category>> {
  try {
    if (!event.categoryId) {
      throw new AppError('VALIDATION_ERROR', 'categoryId is required.')
    }

    const input = await validateInput(UpdateCategoryInput, event.payload ?? {})
    const category = await createCategoriesLambdaCore().update(event.categoryId, input)
    return success(category)
  } catch (error) {
    return failure(error)
  }
}
