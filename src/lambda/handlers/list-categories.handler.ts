import { LambdaResponse, failure, success } from '../lambda-response'
import { validateInput } from '../../common/validation/validate-input'
import { createCategoriesLambdaCore } from '../categories-lambda.factory'
import { PaginationQueryDto } from '../../pagination/pagination-query.dto'
import { PaginatedResponse } from '../../pagination/pagination.types'
import { Category } from '../../categories/category.types'

interface ListCategoriesEvent {
  query?: unknown
}

export async function handler(
  event: ListCategoriesEvent,
): Promise<LambdaResponse<PaginatedResponse<Category>>> {
  try {
    const input = await validateInput(PaginationQueryDto, event.query ?? {})
    const categories = await createCategoriesLambdaCore().findAll(input)
    return success(categories)
  } catch (error) {
    return failure(error)
  }
}
