#!/usr/bin/env node
import * as path from 'path'
import * as cdk from 'aws-cdk-lib'

process.env.INFRA_ENV_FILE ??= path.resolve(__dirname, '..', '..', '.env.dev')

const { getAwsInfraEnv } = require('../lib/config/env') as typeof import('../lib/config/env')
const { ServerStack } = require('../lib/server-stack') as typeof import('../lib/server-stack')
const { ClientStack } = require('../lib/client-stack') as typeof import('../lib/client-stack')

const app = new cdk.App(process.env.CDK_OUTDIR ? { outdir: process.env.CDK_OUTDIR } : undefined)
const infraEnv = getAwsInfraEnv()
const requestedStacks = new Set(
  (process.env.CDK_STACKS ?? 'ServerDevStack')
    .split(',')
    .map((stack) => stack.trim())
    .filter(Boolean),
)

if (requestedStacks.has('ServerDevStack')) {
  new ServerStack(app, 'ServerDevStack', {
    env: {
      account: infraEnv.account,
      region: infraEnv.region,
    },
  })
}

if (requestedStacks.has('ClientDevStack')) {
  new ClientStack(app, 'ClientDevStack', {
    env: {
      account: infraEnv.account,
      region: infraEnv.region,
    },
  })
}

export { app }
