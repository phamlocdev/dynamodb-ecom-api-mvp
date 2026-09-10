import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import type { PostConfirmationTriggerEvent } from 'aws-lambda'
import { SesMailService } from '../mail/ses-mail.service'

@Injectable()
export class PostConfirmationService {
  private readonly logger = new Logger(PostConfirmationService.name)
  private readonly defaultGroup: string
  private readonly cognitoClient: CognitoIdentityProviderClient

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(SesMailService)
    private readonly sesMailService: SesMailService,
  ) {
    this.defaultGroup = configService.get<string>('COGNITO_DEFAULT_GROUP') ?? 'customer'
    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'

    this.cognitoClient = new CognitoIdentityProviderClient({ region })
  }

  async handle(event: PostConfirmationTriggerEvent): Promise<PostConfirmationTriggerEvent> {
    if (!event.userPoolId || !event.userName) {
      return event
    }

    await this.cognitoClient.send(
      new AdminAddUserToGroupCommand({
        GroupName: this.defaultGroup,
        UserPoolId: event.userPoolId,
        Username: event.userName,
      }),
    )

    await this.sendWelcomeEmailBestEffort(event)
    return event
  }

  private async sendWelcomeEmailBestEffort(event: PostConfirmationTriggerEvent): Promise<void> {
    const attributes = event.request.userAttributes ?? {}
    const sub = attributes.sub
    const email = attributes.email

    if (!sub || !email) {
      this.logger.warn(`Skipped welcome email for ${event.userName}: missing sub or email.`)
      return
    }

    try {
      const result = await this.sesMailService.sendWelcomeNewCustomerEmail({
        user: {
          sub,
          username: event.userName,
          email,
          name: attributes.name,
        },
      })

      if (result.status === 'SKIPPED') {
        this.logger.warn(
          `Skipped welcome email for ${event.userName}: ${result.reason ?? 'unknown-reason'}.`,
        )
      }
    } catch (error) {
      this.logger.error(
        `Unexpected failure while sending welcome email for ${event.userName}.`,
        error,
      )
    }
  }
}
