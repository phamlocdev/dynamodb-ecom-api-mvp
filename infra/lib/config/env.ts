import * as path from 'path'
import * as dotenv from 'dotenv'
import { AwsInfraEnv, validateAwsInfraEnv } from '../../../src/config/env.validation'

dotenv.config({
  path: process.env.INFRA_ENV_FILE
    ? path.resolve(process.env.INFRA_ENV_FILE)
    : path.resolve(__dirname, '..', '..', '..', '.env'),
  override: true,
  quiet: true,
})

let cachedEnv: AwsInfraEnv | undefined

export function getAwsInfraEnv(): AwsInfraEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  cachedEnv = validateAwsInfraEnv(process.env)

  return cachedEnv
}
