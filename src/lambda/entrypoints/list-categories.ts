import { createApiGatewayHandler } from '../api-gateway-rest-adapter'
import { handler as listCategoriesHandler } from '../handlers/list-categories.handler'

export const handler = createApiGatewayHandler({
  businessHandler: listCategoriesHandler,
  mapEvent: ({ queryStringParameters }) => ({
    query: queryStringParameters,
  }),
  successStatusCode: 200,
})
