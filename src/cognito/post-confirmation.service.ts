import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import type { PostConfirmationTriggerEvent } from 'aws-lambda'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { SesMailService } from '../mail/ses-mail.service'

@Injectable()
export class PostConfirmationService {
  private readonly logger = new Logger(PostConfirmationService.name)
  private readonly defaultGroup: string
  private readonly userAccountsTableName: string
  private readonly cognitoClient: CognitoIdentityProviderClient

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(SesMailService)
    private readonly sesMailService: SesMailService,
  ) {
    this.defaultGroup = configService.get<string>('COGNITO_DEFAULT_GROUP') ?? 'customer'
    this.userAccountsTableName = configService.get<string>('USER_ACCOUNTS_TABLE') ?? 'user-accounts'
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

    await this.createUserAccount(event)
    await this.sendWelcomeEmailBestEffort(event)
    return event
  }

  private async createUserAccount(event: PostConfirmationTriggerEvent): Promise<void> {
    const attributes = event.request.userAttributes ?? {}
    const sub = attributes.sub

    if (!sub) {
      this.logger.warn(`Skipped account metadata creation for ${event.userName}: missing sub.`)
      return
    }

    const timestamp = new Date().toISOString()
    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.userAccountsTableName,
        Item: {
          userId: sub,
          username: event.userName,
          ...(attributes.email ? { email: attributes.email } : {}),
          ...(attributes.name ? { name: attributes.name } : {}),
          permissions: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    )
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
