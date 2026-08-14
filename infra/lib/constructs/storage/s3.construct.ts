import { Construct } from 'constructs'

export interface S3ConstructProps {
  // Add S3 buckets, lifecycle rules, and bucket notifications here when storage is introduced.
}

export class S3Construct extends Construct {
  constructor(scope: Construct, id: string, _props: S3ConstructProps = {}) {
    super(scope, id)
  }
}
