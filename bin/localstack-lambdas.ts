import * as cdk from 'aws-cdk-lib'
import { LocalstackLambdasStack } from '../lib/localstack-lambdas-stack'

const app = new cdk.App()

new LocalstackLambdasStack(app, 'DynamodbLearningLambdasLocalStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '000000000000',
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-1',
  },
  synthesizer: new cdk.BootstraplessSynthesizer(),
})
