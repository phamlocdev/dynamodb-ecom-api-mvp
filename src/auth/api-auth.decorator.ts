import { applyDecorators } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'

/**
 * @ApiAuth() — composite decorator kết hợp:
 * - @ApiBearerAuth('cognito-jwt'): đánh dấu endpoint yêu cầu Bearer token trong Swagger UI
 * - @ApiUnauthorizedResponse: document response 401
 * - @ApiForbiddenResponse: document response 403
 *
 * Dùng trên bất kỳ controller method nào cần authentication.
 * Thay thế việc phải thêm 3 decorator riêng lẻ mỗi lần.
 */
export function ApiAuth() {
  return applyDecorators(
    ApiBearerAuth('cognito-jwt'),
    ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token.' }),
    ApiForbiddenResponse({ description: 'Insufficient role permissions.' }),
  )
}
