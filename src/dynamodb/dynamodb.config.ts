import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export interface DynamoDbSettings {
  region: string
}

export function getDynamoDbSettings(
  environment: NodeJS.ProcessEnv = process.env,
): DynamoDbSettings {
  return {
    region: environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION ?? 'ap-southeast-1',
  }
}

export function createDynamoDbClient(
  settings: DynamoDbSettings = getDynamoDbSettings(),
): DynamoDBClient {
  return new DynamoDBClient({ region: settings.region })
}

export function createDynamoDbDocumentClient(
  settings: DynamoDbSettings = getDynamoDbSettings(),
): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(createDynamoDbClient(settings), {
    marshallOptions: { removeUndefinedValues: true },
  })
}
