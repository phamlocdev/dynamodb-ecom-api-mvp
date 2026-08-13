import { createApiGatewayHandler } from '../api-gateway-rest-adapter'
import { handler as createCategoryHandler } from '../handlers/create-category.handler'

export const handler = createApiGatewayHandler({
  businessHandler: createCategoryHandler,
  mapEvent: ({ body }) => ({
    payload: body ?? {},
  }),
  successStatusCode: 201,
})
