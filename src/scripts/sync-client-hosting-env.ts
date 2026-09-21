import * as fs from 'fs'
import * as path from 'path'
import { exitWithError, getScriptContext, trimTrailingSlash } from './script-helpers'

type ClientStackOutputs = {
  ClientUrl?: string
}

async function main(): Promise<void> {
  const { serverRoot, envFilePath } = getScriptContext()
  const clientUrl = getClientUrl(path.join(serverRoot, 'client-outputs.json'), isOptionalRun())

  if (!clientUrl) {
    console.log('Skipped client hosting env sync because client-outputs.json is not available yet.')
    return
  }

  const envContent = fs.readFileSync(envFilePath, 'utf8')
  const updated = upsertEnvVar(
    upsertCsvEnvVar(
      upsertCsvEnvVar(
        upsertCsvEnvVar(envContent, 'CLIENT_CORS_ORIGINS', [clientUrl]),
        'CLIENT_COGNITO_CALLBACK_URLS',
        [`${clientUrl}/auth/callback`],
      ),
      'CLIENT_COGNITO_LOGOUT_URLS',
      [`${clientUrl}/auth/login`],
    ),
    'FRONT_END_PAYMENT_RETURN_URL',
    `${clientUrl}/orders/payment-return`,
  )

  fs.writeFileSync(envFilePath, updated, 'utf8')
  console.log(`Synced client hosting URL ${clientUrl} to ${envFilePath}.`)
}

function getClientUrl(outputsPath: string, optional: boolean): string | null {
  if (!fs.existsSync(outputsPath)) {
    if (optional) {
      return null
    }

    throw new Error(`Missing client outputs file at ${outputsPath}. Run npm run infra:deploy:client first.`)
  }

  const parsed = JSON.parse(fs.readFileSync(outputsPath, 'utf8')) as Record<
    string,
    ClientStackOutputs
  >
  const clientUrl = parsed.ClientDevStack?.ClientUrl

  if (!clientUrl) {
    throw new Error('client-outputs.json does not contain ClientDevStack.ClientUrl.')
  }

  return trimTrailingSlash(clientUrl)
}

function isOptionalRun(): boolean {
  return process.argv.includes('--optional')
}

function upsertCsvEnvVar(content: string, key: string, valuesToAdd: string[]): string {
  const pattern = new RegExp(`^${escapeRegex(key)}=(.*)$`, 'm')
  const existingValue = content.match(pattern)?.[1] ?? ''
  const mergedValues = mergeCsvValues(existingValue, valuesToAdd)
  const nextLine = `${key}=${mergedValues.join(',')}`

  if (pattern.test(content)) {
    return content.replace(pattern, nextLine)
  }

  const normalized = content.endsWith('\n') ? content : `${content}\n`
  return `${normalized}${nextLine}\n`
}

function upsertEnvVar(content: string, key: string, value: string): string {
  const pattern = new RegExp(`^${escapeRegex(key)}=.*$`, 'm')
  const nextLine = `${key}=${value}`

  if (pattern.test(content)) {
    return content.replace(pattern, nextLine)
  }

  const normalized = content.endsWith('\n') ? content : `${content}\n`
  return `${normalized}${nextLine}\n`
}

function mergeCsvValues(existingValue: string, valuesToAdd: string[]): string[] {
  const seen = new Set<string>()
  const values = [...existingValue.split(','), ...valuesToAdd]
    .map((value) => value.trim())
    .filter(Boolean)

  return values.filter((value) => {
    if (seen.has(value)) {
      return false
    }

    seen.add(value)
    return true
  })
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

void main().catch(exitWithError)
