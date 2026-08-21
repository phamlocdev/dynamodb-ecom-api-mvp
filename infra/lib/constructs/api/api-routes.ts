import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { localRouteAuthOptions } from '../../shared/route-auth'

export function registerApiRoutes(
  api: apigatewayv2.HttpApi,
  integration: integrations.HttpLambdaIntegration,
  authorizer?: authorizers.HttpJwtAuthorizer,
): void {
  api.addRoutes({
    path: '/health',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
  })

  api.addRoutes({
    path: '/products',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
  })
  api.addRoutes({
    path: '/products',
    methods: [apigatewayv2.HttpMethod.POST],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/products/{productId}',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
  })
  api.addRoutes({
    path: '/products/{productId}',
    methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],
    integration,
    ...localRouteAuthOptions(authorizer),
  })

  api.addRoutes({
    path: '/categories',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
  })
  api.addRoutes({
    path: '/categories',
    methods: [apigatewayv2.HttpMethod.POST],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/categories/{categoryId}',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
  })
  api.addRoutes({
    path: '/categories/{categoryId}',
    methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/users',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
    ...localRouteAuthOptions(authorizer),
  })

  api.addRoutes({
    path: '/carts',
    methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/carts/{cartId}',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/carts/{cartId}/items',
    methods: [apigatewayv2.HttpMethod.POST],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/carts/{cartId}/items/{productId}',
    methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],
    integration,
    ...localRouteAuthOptions(authorizer),
  })

  api.addRoutes({
    path: '/orders',
    methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/orders/{orderId}',
    methods: [apigatewayv2.HttpMethod.GET],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
  api.addRoutes({
    path: '/orders/{orderId}/pay',
    methods: [apigatewayv2.HttpMethod.POST],
    integration,
    ...localRouteAuthOptions(authorizer),
  })
}
