import { failure, LambdaResponse } from './lambda-response'

export interface ApiGatewayProxyEvent {
  body?: string | null
  headers?: Record<string, string | undefined> | null
  httpMethod: string
  isBase64Encoded?: boolean
  pathParameters?: Record<string, string | undefined> | null
  queryStringParameters?: Record<string, string | undefined> | null
  requestContext: object
}

export interface ApiGatewayProxyResult {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

interface HttpRequestShape {
  body?: unknown
  headers: Record<string, string | undefined>
  pathParameters: Record<string, string | undefined>
  queryStringParameters: Record<string, string | undefined>
}

interface ApiGatewayHandlerConfig<TEvent, TData> {
  businessHandler: (event: TEvent) => Promise<LambdaResponse<TData>>
  mapEvent: (request: HttpRequestShape) => TEvent
  successStatusCode: 200 | 201 | 204
}

const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

export function createApiGatewayHandler<TEvent, TData>({
  businessHandler,
  mapEvent,
  successStatusCode,
}: ApiGatewayHandlerConfig<TEvent, TData>) {
  return async (event: ApiGatewayProxyEvent): Promise<ApiGatewayProxyResult> => {
    const corsHeaders = buildCorsHeaders(event.headers)
    const parsedBody = parseRequestBody(event)

    if (!parsedBody.ok) {
      return createErrorResult(
        400,
        {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON.',
        },
        corsHeaders,
      )
    }

    const requestShape: HttpRequestShape = {
      body: parsedBody.value,
      headers: event.headers ?? {},
      pathParameters: event.pathParameters ?? {},
      queryStringParameters: event.queryStringParameters ?? {},
    }

    try {
      const response = await businessHandler(mapEvent(requestShape))
      return createHttpResult(response, successStatusCode, corsHeaders)
    } catch (error) {
      return createHttpResult(failure(error), 200, corsHeaders)
    }
  }
}

function parseRequestBody(
  event: ApiGatewayProxyEvent,
): { ok: true; value: unknown } | { ok: false } {
  if (!event.body) {
    return { ok: true, value: undefined }
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body

  try {
    return { ok: true, value: JSON.parse(rawBody) }
  } catch {
    return { ok: false }
  }
}

function createHttpResult<T>(
  response: LambdaResponse<T>,
  successStatusCode: 200 | 201 | 204,
  corsHeaders: Record<string, string>,
): ApiGatewayProxyResult {
  if (!response.success) {
    return createErrorResult(
      mapErrorCodeToStatusCode(response.error.code),
      response.error,
      corsHeaders,
    )
  }

  if (successStatusCode === 204) {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }

  return {
    statusCode: successStatusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(response.data),
  }
}

function createErrorResult(
  statusCode: number,
  error: {
    code: string
    message: string
    details?: string[]
  },
  corsHeaders: Record<string, string>,
): ApiGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ error }),
  }
}

function mapErrorCodeToStatusCode(code: string): number {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400
    case 'NOT_FOUND':
      return 404
    case 'CONFLICT':
      return 409
    default:
      return 500
  }
}

function buildCorsHeaders(
  headers?: Record<string, string | undefined> | null,
): Record<string, string> {
  const requestOrigin = headers?.origin ?? headers?.Origin
  const allowOrigin =
    requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : 'http://localhost:3000'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PATCH,DELETE',
    Vary: 'Origin',
  }
}
