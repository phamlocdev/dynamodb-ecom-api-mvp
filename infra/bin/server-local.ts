#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { ServerLocalStack } from '../lib/server-local-stack'

const app = new cdk.App()

new ServerLocalStack(app, 'ServerLocalStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '000000000000',
    region: 'ap-southeast-1',
  },
})
