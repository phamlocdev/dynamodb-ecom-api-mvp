import { INestApplicationContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda'
import { AppModule } from '../app.module'
import { normalizePermissions } from '../auth/permissions'
import { DynamoDbService } from '../dynamodb/dynamodb.service'

let cachedContext: Promise<PreTokenGenerationContext> | null = null

type UserAccountRecord = {
  userId: string
  permissions?: unknown
}

type PreTokenGenerationContext = {
  app: INestApplicationContext
  dynamoDbService: DynamoDbService
  userAccountsTableName: string
}

export async function handler(
  event: PreTokenGenerationV2TriggerEvent,
): Promise<PreTokenGenerationV2TriggerEvent> {
  const userId = event.request.userAttributes.sub
  const permissions = userId ? await findPermissions(userId) : []

  event.response.claimsAndScopeOverrideDetails ??= {}
  event.response.claimsAndScopeOverrideDetails.accessTokenGeneration ??= {}
  event.response.claimsAndScopeOverrideDetails.accessTokenGeneration.claimsToAddOrOverride = {
    ...(event.response.claimsAndScopeOverrideDetails.accessTokenGeneration.claimsToAddOrOverride ??
      {}),
    'app:permissions': permissions,
  } as unknown as Record<string, string>

  return event
}

async function findPermissions(userId: string): Promise<string[]> {
  const { dynamoDbService, userAccountsTableName } = await getContext()
  const response = await dynamoDbService.documentClient.send(
    new GetCommand({
      TableName: userAccountsTableName,
      Key: { userId },
    }),
  )

  const record = response.Item as UserAccountRecord | undefined
  return normalizePermissions(record?.permissions)
}

async function getContext(): Promise<PreTokenGenerationContext> {
  cachedContext ??= createContext()
  return cachedContext
}

async function createContext(): Promise<PreTokenGenerationContext> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  })
  const configService = app.get(ConfigService)

  return {
    app,
    dynamoDbService: app.get(DynamoDbService),
    userAccountsTableName: configService.get<string>('USER_ACCOUNTS_TABLE') ?? 'user-accounts',
  }
}
