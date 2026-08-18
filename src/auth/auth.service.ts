import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  UsernameExistsException,
  NotAuthorizedException,
  UserNotConfirmedException,
} from '@aws-sdk/client-cognito-identity-provider'
import { LoginDto, SignUpDto, TokenResponseDto } from './dto/auth.dto'

/**
 * AuthService — cung cấp login/signup trực tiếp qua Cognito InitiateAuth.
 *
 * Tại sao cần endpoint này?
 * → Swagger UI cần access_token để test protected endpoints.
 * → Thay vì extract token từ Next.js console.log, ta có thể login thẳng ở đây.
 * → Dùng USER_PASSWORD_AUTH flow — phù hợp cho dev/testing.
 *
 * Lưu ý: Cognito User Pool phải cho phép USER_PASSWORD_AUTH
 * (ALLOW_USER_PASSWORD_AUTH trong auth flows).
 */
@Injectable()
export class AuthService {
  private readonly cognitoClient: CognitoIdentityProviderClient
  private readonly clientId: string

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'
    const endpoint = configService.get<string>('COGNITO_IDP_ENDPOINT')
    const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID') ?? 'test'
    const secretAccessKey = configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? 'test'

    this.clientId = configService.get<string>('COGNITO_CLIENT_ID') ?? ''

    this.cognitoClient = new CognitoIdentityProviderClient({
      region,
      ...(endpoint ? { endpoint } : {}),
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  /**
   * Login — trả về access_token để paste vào Swagger Authorize.
   *
   * Dùng USER_PASSWORD_AUTH flow (không cần SRP).
   * Phù hợp cho local dev/testing với LocalStack.
   */
  async login(dto: LoginDto): Promise<TokenResponseDto> {
    try {
      const response = await this.cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: this.clientId,
          AuthParameters: {
            USERNAME: dto.username,
            PASSWORD: dto.password,
          },
        }),
      )

      const result = response.AuthenticationResult
      if (!result?.AccessToken || !result?.IdToken) {
        throw new UnauthorizedException('Authentication failed — no tokens returned.')
      }

      return {
        access_token: result.AccessToken,
        id_token: result.IdToken,
        token_type: 'Bearer',
        expires_in: result.ExpiresIn ?? 3600,
      }
    } catch (error) {
      if (error instanceof NotAuthorizedException) {
        throw new UnauthorizedException('Incorrect username or password.')
      }
      if (error instanceof UserNotConfirmedException) {
        throw new UnauthorizedException('User account is not confirmed.')
      }
      throw error
    }
  }

  /**
   * Sign up — tạo tài khoản Cognito mới.
   * Email được dùng làm username.
   * User vẫn cần confirm (qua email hoặc admin confirm) trước khi login được.
   *
   * Lưu ý với LocalStack: email confirmation thường bị bypass.
   * Dùng script seed hoặc admin confirm user để test nhanh.
   */
  async signUp(dto: SignUpDto): Promise<{ message: string; userSub: string }> {
    try {
      const response = await this.cognitoClient.send(
        new SignUpCommand({
          ClientId: this.clientId,
          Username: dto.email,
          Password: dto.password,
          UserAttributes: [
            { Name: 'email', Value: dto.email },
          ],
        }),
      )

      return {
        message: 'Sign up successful. Check email for confirmation code (or admin-confirm for LocalStack).',
        userSub: response.UserSub ?? '',
      }
    } catch (error) {
      if (error instanceof UsernameExistsException) {
        throw new ConflictException('An account with this email already exists.')
      }
      throw error
    }
  }
}
