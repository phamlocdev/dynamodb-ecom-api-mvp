import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common'
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { LoginDto, SignUpDto, TokenResponseDto } from './dto/auth.dto'
import { Public } from './public.decorator'
import { DtoValidationPipe } from '../validation/dto-validation.pipe'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  /**
   * POST /auth/token — Login và lấy access_token.
   *
   * Workflow trong Swagger UI:
   * 1. Gọi endpoint này với username + password
   * 2. Copy `access_token` từ response
   * 3. Click nút "Authorize 🔒" ở góc phải Swagger UI
   * 4. Paste token vào field "Value" → click Authorize
   * 5. Tất cả protected requests sẽ tự đính kèm Bearer token
   */
  @Post('token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login — get access token for Swagger authentication',
    description:
      'Returns a Cognito access_token. ' +
      'Copy the `access_token` value and paste it into the Swagger "Authorize 🔒" button.',
  })
  @ApiOkResponse({ type: TokenResponseDto, description: 'JWT tokens returned.' })
  @ApiUnauthorizedResponse({ description: 'Incorrect username or password.' })
  login(@Body(new DtoValidationPipe(LoginDto)) dto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(dto)
  }

  @Post('signup')
  @Public()
  @ApiOperation({
    summary: 'Sign up — create a new Cognito account',
    description:
      'Creates a new user in Cognito User Pool. ' +
      'On LocalStack, user may need admin-confirmation before login.',
  })
  @ApiCreatedResponse({ description: 'Account created successfully.' })
  signUp(@Body(new DtoValidationPipe(SignUpDto)) dto: SignUpDto) {
    return this.authService.signUp(dto)
  }
}
