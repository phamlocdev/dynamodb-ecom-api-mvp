const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const serverRoot = path.resolve(__dirname, '..')
const envFilePath = path.join(serverRoot, '.env.dev')
const cdkOutPath = path.join(serverRoot, 'cdk.out')

dotenv.config({ path: envFilePath, override: false, quiet: true })

const [, , subcommand, ...rawRestArgs] = process.argv

if (!subcommand) {
  console.error('Missing CDK subcommand.')
  process.exit(1)
}

const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION
const stackNames = []
let optionArgsStart = 0

while (optionArgsStart < rawRestArgs.length) {
  const current = rawRestArgs[optionArgsStart]
  if (!current || current.startsWith('-') || current.startsWith('aws://')) {
    break
  }

  stackNames.push(current)
  optionArgsStart += 1
}

const restArgs = rawRestArgs.slice(optionArgsStart)
const requestedStacks = subcommand === 'bootstrap' ? [] : stackNames.length > 0 ? stackNames : ['ServerDevStack']
const explicitBootstrapTarget = restArgs.find((arg) => arg.startsWith('aws://'))
const resolvedBootstrapTarget = explicitBootstrapTarget ?? (account && region ? `aws://${account}/${region}` : null)
const edgeBootstrapTarget = account ? `aws://${account}/us-east-1` : null

if (subcommand === 'bootstrap') {
  if (!resolvedBootstrapTarget) {
    console.error(
      `Missing bootstrap target. Pass aws://<account-id>/<region> or set CDK_DEFAULT_ACCOUNT and AWS_REGION in ${envFilePath}.`,
    )
    process.exit(1)
  }
} else if (!account || !region) {
  console.error(`Missing CDK_DEFAULT_ACCOUNT or AWS_REGION in ${envFilePath}.`)
  process.exit(1)
}

const cdkCliPath = require.resolve('aws-cdk/bin/cdk')
const appCommand = 'npx ts-node infra/bin/server.ts'
const args = [cdkCliPath, subcommand]

if (fs.existsSync(cdkOutPath)) {
  fs.rmSync(cdkOutPath, { recursive: true, force: true })
}

if (subcommand === 'bootstrap') {
  args.push(resolvedBootstrapTarget)
  if (!explicitBootstrapTarget && edgeBootstrapTarget && edgeBootstrapTarget !== resolvedBootstrapTarget) {
    args.push(edgeBootstrapTarget)
  }
} else {
  args.push(...requestedStacks)
}

if (subcommand === 'bootstrap') {
  args.push(...restArgs.filter((arg) => !arg.startsWith('aws://')))
} else {
  args.push('--app', appCommand, ...restArgs)
}

const result = spawnSync(process.execPath, args, {
  cwd: serverRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    CDK_STACKS: requestedStacks.join(','),
  },
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 0)
