import { createApiGatewayHandler } from '../api-gateway-rest-adapter'
import { handler as getCategoryHandler } from '../handlers/get-category.handler'

export const handler = createApiGatewayHandler({
  businessHandler: getCategoryHandler,
  mapEvent: ({ pathParameters }) => ({
    categoryId: pathParameters.categoryId,
  }),
  successStatusCode: 200,
})
