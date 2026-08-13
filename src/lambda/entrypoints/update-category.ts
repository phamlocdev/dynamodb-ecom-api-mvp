import { createApiGatewayHandler } from '../api-gateway-rest-adapter'
import { handler as updateCategoryHandler } from '../handlers/update-category.handler'

export const handler = createApiGatewayHandler({
  businessHandler: updateCategoryHandler,
  mapEvent: ({ body, pathParameters }) => ({
    categoryId: pathParameters.categoryId,
    payload: body ?? {},
  }),
  successStatusCode: 200,
})
