import { LambdaResponse, failure, success } from '../lambda-response'
import { validateInput } from '../../common/validation/validate-input'
import { createCategoriesLambdaCore } from '../categories-lambda.factory'
import { Category } from '../../categories/category.types'
import { CreateCategoryInput } from '../../categories/inputs/create-category.input'

interface CreateCategoryEvent {
  payload?: unknown
}

export async function handler(
  event: CreateCategoryEvent,
): Promise<LambdaResponse<Category>> {
  try {
    const input = await validateInput(CreateCategoryInput, event.payload ?? {})
    const category = await createCategoriesLambdaCore().create(input)
    return success(category)
  } catch (error) {
    return failure(error)
  }
}
