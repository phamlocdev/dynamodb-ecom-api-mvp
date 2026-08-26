import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

export interface S3ConstructProps {
  bucketName: string
  clientOrigins: string[]
}

export class S3Construct extends Construct {
  readonly mediaBucket: s3.Bucket

  constructor(scope: Construct, id: string, props: S3ConstructProps) {
    super(scope, id)

    this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: props.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      cors: [
        {
          allowedOrigins: props.clientOrigins,
          allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedHeaders: ['content-type', 'x-amz-*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    })
  }
}
