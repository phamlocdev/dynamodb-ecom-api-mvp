import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { AuthenticatedRequest, AuthenticatedUser, JwtAuthorizerClaims } from './auth.types'
import { normalizePermissions } from './permissions'
import { IS_PUBLIC_KEY } from './public.decorator'
import { Role } from './roles.enum'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const claims = readJwtClaims(request)

    if (!claims) {
      throw new UnauthorizedException('Missing authenticated user context.')
    }

    request.user = toAuthenticatedUser(claims)
    return true
  }
}

function readJwtClaims(request: AuthenticatedRequest): JwtAuthorizerClaims | undefined {
  const event = request.apiGateway?.event
  if (!event || !('authorizer' in event.requestContext)) {
    return undefined
  }

  const authorizer = (event as APIGatewayProxyEventV2WithJWTAuthorizer).requestContext.authorizer
  const authorizerClaims = authorizer?.jwt?.claims
  const tokenClaims = readBearerTokenClaims(request)

  return authorizerClaims || tokenClaims
    ? ({
        ...(authorizerClaims ?? {}),
        ...(tokenClaims ?? {}),
      } as JwtAuthorizerClaims)
    : undefined
}

function toAuthenticatedUser(claims: JwtAuthorizerClaims): AuthenticatedUser {
  const groups = readGroups(claims['cognito:groups']).flatMap(mapRole)
  const username = readString(claims.username) ?? readString(claims['cognito:username'])
  const clientId = readString(claims.client_id) ?? readString(claims.aud)
  const sub = readString(claims.sub)

  if (!username || !clientId || !sub) {
    throw new UnauthorizedException('Authenticated user claims are incomplete.')
  }

  const scopes = Array.isArray(claims.scope)
    ? claims.scope.filter((value): value is string => typeof value === 'string').join(' ')
    : readString(claims.scope)

  return {
    sub,
    username,
    email: readString(claims.email),
    name: readString(claims.name),
    groups,
    permissions: normalizePermissions(claims['app:permissions']),
    tokenUse: 'access',
    scope: scopes,
    clientId,
  }
}

function readGroups(value: JwtAuthorizerClaims[keyof JwtAuthorizerClaims]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  if (typeof value !== 'string') {
    return []
  }

  const normalized = value.trim()
  if (!normalized) {
    return []
  }

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    const inner = normalized.slice(1, -1).trim()
    if (!inner) {
      return []
    }

    try {
      const parsed = JSON.parse(normalized)
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : []
    } catch {
      return inner
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    }
  }

  if (normalized.includes(',')) {
    return normalized
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return [normalized]
}

function readString(value: JwtAuthorizerClaims[keyof JwtAuthorizerClaims]): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readBearerTokenClaims(request: AuthenticatedRequest): Record<string, unknown> | undefined {
  const authorizationHeader = request.headers.authorization
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) {
    return undefined
  }

  return decodeJwtPayload(token)
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const payload = token.split('.')[1]
    if (!payload) {
      return undefined
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
      '=',
    )

    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function mapRole(value: string): Role[] {
  if (value === Role.CUSTOMER || value === Role.MANAGER || value === Role.ADMIN) {
    return [value]
  }
  return []
}
