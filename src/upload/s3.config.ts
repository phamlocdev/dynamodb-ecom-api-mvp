import { S3Client } from '@aws-sdk/client-s3'

export interface S3Settings {
  region: string
  bucketName: string
}

export function getS3Settings(environment: NodeJS.ProcessEnv = process.env): S3Settings {
  return {
    region: environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION ?? 'ap-southeast-1',
    bucketName: environment.MEDIA_BUCKET_NAME ?? 'ecommerce-media-dev',
  }
}

export function createS3Client(settings: S3Settings = getS3Settings()): S3Client {
  return new S3Client({ region: settings.region })
}
