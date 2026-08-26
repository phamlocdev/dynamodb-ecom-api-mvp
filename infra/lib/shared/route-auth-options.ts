import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
export function routeAuthOptions(
  authorizer?: authorizers.HttpJwtAuthorizer,
): Pick<apigatewayv2.AddRoutesOptions, 'authorizer'> {
  if (!authorizer) {
    throw new Error('JWT authorizer was not created.')
  }

  return {
    authorizer,
  }
}
