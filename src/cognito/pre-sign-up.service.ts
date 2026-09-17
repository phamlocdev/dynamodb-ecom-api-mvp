import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PreSignUpTriggerEvent } from 'aws-lambda'

@Injectable()
export class PreSignUpService {
  private readonly logger = new Logger(PreSignUpService.name)
  private readonly disposableEmailDomains: Set<string>

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.disposableEmailDomains = new Set(
      (configService.get<string>('COGNITO_DISPOSABLE_EMAIL_DOMAINS') ?? '')
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    )
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
}

function normalizeEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase()
  return email || undefined
}

function extractDomain(email: string): string | undefined {
  const [, domain] = email.split('@')
  return domain?.trim().toLowerCase() || undefined
}
