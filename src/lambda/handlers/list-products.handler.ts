import { LambdaResponse, failure, success } from '../lambda-response'
import { validateInput } from '../../common/validation/validate-input'
import { ListProductsQueryInput } from '../../products/inputs/list-products-query.input'
import { createProductsLambdaCore } from '../products-lambda.factory'
import { PaginatedResponse } from '../../pagination/pagination.types'
import { Product } from '../../products/product.types'

interface ListProductsEvent {
  query?: unknown
}

export async function handler(
  event: ListProductsEvent,
): Promise<LambdaResponse<PaginatedResponse<Product>>> {
  try {
    const input = await validateInput(ListProductsQueryInput, event.query ?? {})
    const products = await createProductsLambdaCore().findAll(input)
    return success(products)
  } catch (error) {
    return failure(error)
  }
}
