import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { PreAuthenticationTriggerEvent } from 'aws-lambda'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { UserAccountStatus } from '../users/user.types'

type UserAccountRecord = {
  userId: string
  status?: UserAccountStatus
}

const BLOCKED_STATUSES = new Set<UserAccountStatus>(['SUSPENDED', 'PENDING_APPROVAL', 'DELETED'])

@Injectable()
export class PreAuthenticationService {
  private readonly logger = new Logger(PreAuthenticationService.name)
  private readonly userAccountsTableName: string

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
  ) {
    this.userAccountsTableName = configService.get<string>('USER_ACCOUNTS_TABLE') ?? 'user-accounts'
  }

  async handle(event: PreAuthenticationTriggerEvent): Promise<PreAuthenticationTriggerEvent> {
    const userId = event.request.userAttributes.sub

    if (!userId) {
      this.logger.warn(
        JSON.stringify({
          decision: 'ALLOW',
          reason: 'missing-sub',
          triggerSource: event.triggerSource,
          userPoolId: event.userPoolId,
          userName: event.userName,
        }),
      )
      return event
    }

    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.userAccountsTableName,
        Key: { userId },
      }),
    )
    const account = response.Item as UserAccountRecord | undefined
    const status = account?.status

    if (status && BLOCKED_STATUSES.has(status)) {
      this.logger.warn(
        JSON.stringify({
          decision: 'DENY',
          reason: 'blocked-account-status',
          triggerSource: event.triggerSource,
          userPoolId: event.userPoolId,
          userName: event.userName,
          userId,
          status,
        }),
      )
      throw new Error('This account is not allowed to sign in.')
    }

    this.logger.log(
      JSON.stringify({
        decision: 'ALLOW',
        triggerSource: event.triggerSource,
        userPoolId: event.userPoolId,
        userName: event.userName,
        userId,
        status: status ?? 'LEGACY_MISSING_STATUS',
      }),
    )

    return event
  }
}
