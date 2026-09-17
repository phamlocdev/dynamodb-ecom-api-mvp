import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda'
import { normalizePermissions } from '../auth/permissions'
import { DynamoDbService } from '../dynamodb/dynamodb.service'

type UserAccountRecord = {
  userId: string
  permissions?: unknown
}

@Injectable()
export class PreTokenGenerationService {
  private readonly userAccountsTableName: string

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
  ) {
    this.userAccountsTableName = configService.get<string>('USER_ACCOUNTS_TABLE') ?? 'user-accounts'
  }

  async handle(event: PreTokenGenerationV2TriggerEvent): Promise<PreTokenGenerationV2TriggerEvent> {
    const userId = event.request.userAttributes.sub
    const permissions = userId ? await this.findPermissions(userId) : []

    event.response.claimsAndScopeOverrideDetails ??= {}
    event.response.claimsAndScopeOverrideDetails.accessTokenGeneration ??= {}
    event.response.claimsAndScopeOverrideDetails.accessTokenGeneration.claimsToAddOrOverride = {
      ...(event.response.claimsAndScopeOverrideDetails.accessTokenGeneration
        .claimsToAddOrOverride ?? {}),
      'app:permissions': permissions,
    } as unknown as Record<string, string>

    return event
  }

  private async findPermissions(userId: string): Promise<string[]> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.userAccountsTableName,
        Key: { userId },
      }),
    )

    const record = response.Item as UserAccountRecord | undefined
    return normalizePermissions(record?.permissions)
  }
}
