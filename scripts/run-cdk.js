const { spawnSync } = require('child_process')
const path = require('path')
const dotenv = require('dotenv')

const serverRoot = path.resolve(__dirname, '..')
const envFilePath = path.join(serverRoot, '.env.dev')

dotenv.config({ path: envFilePath, override: false, quiet: true })

const [, , subcommand, ...restArgs] = process.argv

if (!subcommand) {
  console.error('Missing CDK subcommand.')
  process.exit(1)
}

const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION

if (!account || !region) {
  console.error(`Missing CDK_DEFAULT_ACCOUNT or AWS_REGION in ${envFilePath}.`)
  process.exit(1)
}

const cdkCliPath = require.resolve('aws-cdk/bin/cdk')
const appCommand = 'npx ts-node infra/bin/server.ts'
const args = [cdkCliPath, subcommand]

if (subcommand === 'bootstrap') {
  args.push(`aws://${account}/${region}`)
} else {
  args.push('ServerDevStack')
}

args.push('--app', appCommand, ...restArgs)

const result = spawnSync(process.execPath, args, {
  cwd: serverRoot,
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 0)
