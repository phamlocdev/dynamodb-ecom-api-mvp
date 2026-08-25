import * as path from 'path'
import * as dotenv from 'dotenv'
import { LocalStackInfraEnv, validateLocalStackInfraEnv } from '../../../src/config/env.validation'

dotenv.config({
  path: path.resolve(__dirname, '..', '..', '..', '.env'),
  override: true,
  quiet: true,
})

let cachedEnv: LocalStackInfraEnv | undefined

export function getLocalStackInfraEnv(): LocalStackInfraEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  cachedEnv = validateLocalStackInfraEnv(process.env)

  return cachedEnv
}
