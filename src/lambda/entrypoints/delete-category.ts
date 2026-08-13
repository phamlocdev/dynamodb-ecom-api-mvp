import { createApiGatewayHandler } from '../api-gateway-rest-adapter'
import { handler as deleteCategoryHandler } from '../handlers/delete-category.handler'

export const handler = createApiGatewayHandler({
  businessHandler: deleteCategoryHandler,
  mapEvent: ({ pathParameters }) => ({
    categoryId: pathParameters.categoryId,
  }),
  successStatusCode: 204,
})
