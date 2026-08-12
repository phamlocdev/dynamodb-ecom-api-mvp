import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export interface DynamoDbSettings {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

export function getDynamoDbSettings(
  environment: NodeJS.ProcessEnv = process.env,
): DynamoDbSettings {
  return {
    endpoint: environment.DYNAMODB_ENDPOINT ?? 'http://localhost:4566',
    region: environment.AWS_REGION ?? 'ap-southeast-1',
    accessKeyId: environment.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: environment.AWS_SECRET_ACCESS_KEY ?? 'test',
  }
}

export function createDynamoDbClient(
  settings: DynamoDbSettings = getDynamoDbSettings(),
): DynamoDBClient {
  const config: DynamoDBClientConfig = {
    endpoint: settings.endpoint,
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
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
