import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs'

export interface SqsSettings {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * Đọc SQS config từ environment variables.
 * SQS_ENDPOINT thường cùng với DYNAMODB_ENDPOINT khi dùng LocalStack (http://localhost:4566).
 */
export function getSqsSettings(environment: NodeJS.ProcessEnv = process.env): SqsSettings {
  return {
    endpoint: environment.SQS_ENDPOINT ?? 'http://localhost:4566',
    region: environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION ?? 'ap-southeast-1',
    accessKeyId: environment.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: environment.AWS_SECRET_ACCESS_KEY ?? 'test',
  }
}

/**
 * Factory function tạo SQSClient đã được cấu hình.
 * Pattern này tương tự createDynamoDbClient — đảm bảo consistency trong codebase.
 */
export function createSqsClient(settings: SqsSettings = getSqsSettings()): SQSClient {
  const config: SQSClientConfig = {
    endpoint: settings.endpoint,
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  }

  return new SQSClient(config)
}
