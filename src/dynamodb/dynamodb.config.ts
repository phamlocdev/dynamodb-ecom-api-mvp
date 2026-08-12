import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export interface DynamoDbSettings {
  endpoint?: string
  region: string
  accessKeyId?: string
  secretAccessKey?: string
}

export function getDynamoDbSettings(
  environment: NodeJS.ProcessEnv = process.env,
): DynamoDbSettings {
  const isAwsManagedRuntime = Boolean(environment.AWS_EXECUTION_ENV)

  return {
    endpoint: environment.DYNAMODB_ENDPOINT ?? (isAwsManagedRuntime ? undefined : 'http://localhost:4566'),
    region: environment.AWS_REGION ?? 'ap-southeast-1',
    accessKeyId: environment.AWS_ACCESS_KEY_ID ?? (isAwsManagedRuntime ? undefined : 'test'),
    secretAccessKey:
      environment.AWS_SECRET_ACCESS_KEY ?? (isAwsManagedRuntime ? undefined : 'test'),
  }
}

export function createDynamoDbClient(
  settings: DynamoDbSettings = getDynamoDbSettings(),
): DynamoDBClient {
  const config: DynamoDBClientConfig = {
    region: settings.region,
  }

  if (settings.endpoint) {
    config.endpoint = settings.endpoint
  }

  if (settings.accessKeyId && settings.secretAccessKey) {
    config.credentials = {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    }
  }

  return new DynamoDBClient(config)
}

export function createDynamoDbDocumentClient(
  settings: DynamoDbSettings = getDynamoDbSettings(),
): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(createDynamoDbClient(settings), {
    marshallOptions: { removeUndefinedValues: true },
  })
}
