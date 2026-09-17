import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { PreSignUpTriggerEvent } from 'aws-lambda'

@Injectable()
export class PreSignUpService {
  private readonly logger = new Logger(PreSignUpService.name)
  private readonly disposableEmailDomains: Set<string>
  private readonly cognitoClient: CognitoIdentityProviderClient

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.disposableEmailDomains = new Set(
      (configService.get<string>('COGNITO_DISPOSABLE_EMAIL_DOMAINS') ?? '')
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    )
    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'

    this.cognitoClient = new CognitoIdentityProviderClient({ region })
  }

  async handle(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
    const email = normalizeEmail(event.request.userAttributes.email)
    const domain = email ? extractDomain(email) : undefined

    if (!email || !domain) {
      const decision = event.triggerSource === 'PreSignUp_SignUp' ? 'DENY' : 'ALLOW'
      this.logger.warn(
        JSON.stringify({
          decision,
          reason: 'missing-or-invalid-email',
          triggerSource: event.triggerSource,
          userPoolId: event.userPoolId,
          userName: event.userName,
        }),
      )

      if (decision === 'DENY') {
        throw new Error('A valid email address is required to sign up.')
      }

      return event
    }

    if (this.disposableEmailDomains.has(domain)) {
      this.logger.warn(
        JSON.stringify({
          decision: 'DENY',
          reason: 'disposable-email-domain',
          triggerSource: event.triggerSource,
          userPoolId: event.userPoolId,
          userName: event.userName,
          emailDomain: domain,
        }),
      )
      throw new Error('Please use a permanent email address to sign up.')
    }

    const existingUser = await this.findExistingUserByEmail(event.userPoolId, email)
    if (existingUser) {
      this.logger.warn(
        JSON.stringify({
          decision: 'DENY',
          reason: 'duplicate-email',
          triggerSource: event.triggerSource,
          userPoolId: event.userPoolId,
          userName: event.userName,
          existingUserName: existingUser.Username,
          existingUserStatus: existingUser.UserStatus,
          emailDomain: domain,
        }),
      )
      const errorCode =
        existingUser.UserStatus === 'UNCONFIRMED'
          ? 'AUTH_DUPLICATE_EMAIL_UNCONFIRMED'
          : 'AUTH_DUPLICATE_EMAIL_CONFIRMED'

      throw new Error(errorCode)
    }

    this.logger.log(
      JSON.stringify({
        decision: 'ALLOW',
        triggerSource: event.triggerSource,
        userPoolId: event.userPoolId,
        userName: event.userName,
        emailDomain: domain,
      }),
    )

    return event
  }

  private async findExistingUserByEmail(
    userPoolId: string,
    email: string,
  ): Promise<{ Username?: string; UserStatus?: string } | undefined> {
    const response = await this.cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${escapeCognitoFilterValue(email)}"`,
        Limit: 1,
      }),
    )

    return response.Users?.[0]
  }
}

function normalizeEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase()
  return email || undefined
}

function extractDomain(email: string): string | undefined {
  const [, domain] = email.split('@')
  return domain?.trim().toLowerCase() || undefined
}

function escapeCognitoFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
