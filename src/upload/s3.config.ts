import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3'

export interface S3Settings {
  region: string
  accessKeyId: string
  secretAccessKey: string
  internalEndpoint?: string
  publicEndpoint?: string
  bucketName: string
}

export function getS3Settings(environment: NodeJS.ProcessEnv = process.env): S3Settings {
  const endpoint = environment.S3_ENDPOINT
  return {
    region: environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION ?? 'ap-southeast-1',
    accessKeyId: environment.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: environment.AWS_SECRET_ACCESS_KEY ?? 'test',
    internalEndpoint: environment.S3_LAMBDA_ENDPOINT ?? endpoint,
    publicEndpoint: environment.S3_PUBLIC_ENDPOINT ?? endpoint,
    bucketName: environment.MEDIA_BUCKET_NAME ?? 'ecommerce-media-local',
  }
}

export function createS3Client(
  endpoint: string | undefined,
  settings: S3Settings = getS3Settings(),
): S3Client {
  const config: S3ClientConfig = {
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  }

  return new S3Client(config)
}
