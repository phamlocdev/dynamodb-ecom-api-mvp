#!/usr/bin/env node
import * as path from 'path'
import * as cdk from 'aws-cdk-lib'

process.env.INFRA_ENV_FILE ??= path.resolve(__dirname, '..', '..', '.env.dev')

const { getAwsInfraEnv } = require('../lib/config/env') as typeof import('../lib/config/env')
const { ServerStack } = require('../lib/server-stack') as typeof import('../lib/server-stack')

const app = new cdk.App(process.env.CDK_OUTDIR ? { outdir: process.env.CDK_OUTDIR } : undefined)
const infraEnv = getAwsInfraEnv()

new ServerStack(app, 'ServerDevStack', {
  env: {
    account: infraEnv.account,
    region: infraEnv.region,
  },
})

export { app }
