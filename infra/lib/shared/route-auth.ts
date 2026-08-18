import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { enableLocalStackApiGatewayAuthorizer } from '../config/constants'

export function localRouteAuthOptions(
  authorizer?: authorizers.HttpJwtAuthorizer,
): Pick<apigatewayv2.AddRoutesOptions, 'authorizer'> {
  if (!enableLocalStackApiGatewayAuthorizer) {
    return {}
  }

  if (!authorizer) {
    throw new Error('JWT authorizer is enabled but was not created.')
  }

  return {
    authorizer,
  }
}
