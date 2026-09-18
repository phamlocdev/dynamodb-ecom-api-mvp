import {
  CreateSecretCommand,
  DescribeSecretCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { exitWithError } from './script-helpers'

const serverRoot = path.resolve(__dirname, '..', '..')
const envFilePath = process.env.INFRA_ENV_FILE
  ? path.resolve(process.env.INFRA_ENV_FILE)
  : path.join(serverRoot, '.env.dev')

dotenv.config({ path: envFilePath, override: false, quiet: true })

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION
if (!region) {
  throw new Error(`Missing AWS_REGION or AWS_DEFAULT_REGION in ${envFilePath}.`)
}

const googleClientSecretName =
  process.env.GOOGLE_CLIENT_SECRET_NAME ?? 'ecommerce/dev/google-client-secret'
const vnpaySecretName = process.env.VNPAY_SECRET_NAME ?? 'ecommerce/dev/vnpay'
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const vnpayTmnCode = process.env.VNPAY_TMN_CODE
const vnpaySecureSecret = process.env.VNPAY_SECURE_SECRET

const secretsClient = new SecretsManagerClient({ region })

async function main() {
  await upsertOrVerifySecret(
    googleClientSecretName,
    googleClientSecret,
    'GOOGLE_CLIENT_SECRET',
    'Google OAuth client secret',
  )

  const vnpaySecretString =
    vnpayTmnCode && vnpaySecureSecret
      ? JSON.stringify(
          {
            tmnCode: vnpayTmnCode,
            secureSecret: vnpaySecureSecret,
          },
          null,
          2,
        )
      : undefined
  await upsertOrVerifySecret(
    vnpaySecretName,
    vnpaySecretString,
    'VNPAY_TMN_CODE and VNPAY_SECURE_SECRET',
    'VNPay gateway credentials',
  )
}

async function upsertOrVerifySecret(
  name: string,
  secretString: string | undefined,
  seedEnvNames: string,
  description: string,
) {
  const exists = await secretExists(name)
  if (!secretString) {
    if (!exists) {
      throw new Error(
        `Secret ${name} does not exist and ${seedEnvNames} is missing from ${envFilePath}.`,
      )
    }
    console.log(`Verified secret ${name}; no plaintext seed value found, so update was skipped.`)
    return
  }

  if (exists) {
    await secretsClient.send(
      new PutSecretValueCommand({
        SecretId: name,
        SecretString: secretString,
      }),
    )
    console.log(`Updated secret ${name}.`)
    return
  }

  await secretsClient.send(
    new CreateSecretCommand({
      Name: name,
      Description: description,
      SecretString: secretString,
    }),
  )
  console.log(`Created secret ${name}.`)
}

async function secretExists(name: string): Promise<boolean> {
  try {
    await secretsClient.send(new DescribeSecretCommand({ SecretId: name }))
    return true
  } catch (error) {
    if (isResourceNotFoundException(error)) {
      return false
    }
    throw error
  }
}

function isResourceNotFoundException(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ResourceNotFoundException'
  )
}

main().catch(exitWithError)
