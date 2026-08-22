#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { getLocalStackInfraEnv } from '../lib/config/env'
import { ServerLocalStack } from '../lib/stacks/server-local-stack'

const app = new cdk.App()
const infraEnv = getLocalStackInfraEnv()

new ServerLocalStack(app, 'ServerLocalStack', {
  env: {
    account: infraEnv.account,
    region: infraEnv.region,
  },
})
