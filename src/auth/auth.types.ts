import type {
  APIGatewayEventRequestContextJWTAuthorizer,
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
} from 'aws-lambda'
import type { Request } from 'express'
import { Role } from './roles.enum'

export interface AuthenticatedUser {
  sub: string
  username: string
  email?: string
  groups: Role[]
  tokenUse: 'access'
  scope?: string
  clientId: string
}

export type JwtAuthorizerClaims = APIGatewayEventRequestContextJWTAuthorizer['jwt']['claims']

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
  apiGateway?: {
    event?: APIGatewayProxyEventV2 | APIGatewayProxyEventV2WithJWTAuthorizer
  }
}
