import * as fs from 'fs'
import * as path from 'path'

type StackOutputs = Record<string, string>
type OutputFileShape = Record<string, StackOutputs>

const serverRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.resolve(serverRoot, '..')
const outputsPath = path.join(serverRoot, 'localstack-outputs.json')
const serverEnvPath = path.join(serverRoot, '.env')
const clientEnvPath = path.join(workspaceRoot, 'client', '.env')

function main(): void {
  const outputs = readOutputs(outputsPath)
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1'

  updateEnvFile(serverEnvPath, {
    COGNITO_USER_POOL_ID: requireOutput(outputs, 'CognitoUserPoolId'),
    COGNITO_CLIENT_ID: requireOutput(outputs, 'CognitoClientId'),
  })

  updateEnvFile(clientEnvPath, {
    NEXT_PUBLIC_API_GATEWAY_BASE_URL: requireOutput(outputs, 'LocalStackApiGatewayUrl'),
    NEXT_PUBLIC_COGNITO_REGION: region,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: requireOutput(outputs, 'CognitoUserPoolId'),
    NEXT_PUBLIC_COGNITO_CLIENT_ID: requireOutput(outputs, 'CognitoClientId'),
    NEXT_PUBLIC_COGNITO_DOMAIN_URL: requireOutput(outputs, 'HostedUiDomain'),
    NEXT_PUBLIC_COGNITO_USER_POOL_ENDPOINT: 'http://localhost.localstack.cloud:4566',
  })

  console.log(`Updated ${relativeToWorkspace(outputsPath)}.`)
  console.log(`Updated ${relativeToWorkspace(serverEnvPath)}.`)
  console.log(`Updated ${relativeToWorkspace(clientEnvPath)}.`)
}

function readOutputs(filePath: string): StackOutputs {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${relativeToWorkspace(filePath)}. Run infra:deploy first.`)
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(content) as OutputFileShape
  const stackOutputs = parsed.ServerLocalStack

  if (!stackOutputs) {
    throw new Error(`Could not find ServerLocalStack outputs in ${relativeToWorkspace(filePath)}.`)
  }

  return stackOutputs
}

function requireOutput(outputs: StackOutputs, key: string): string {
  const value = outputs[key]
  if (!value) {
    throw new Error(`Missing output "${key}" in ${relativeToWorkspace(outputsPath)}.`)
  }

  return value
}

function updateEnvFile(filePath: string, updates: Record<string, string>): void {
  const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const lines = original.length > 0 ? original.split(/\r?\n/) : []
  const seen = new Set<string>()

  const nextLines = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/i.exec(line)
    if (!match) {
      return line
    }

    const [, key] = match
    if (!(key in updates)) {
      return line
    }

    seen.add(key)
    return `${key}=${updates[key]}`
  })

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`)
    }
  }

  const serialized = nextLines.join(eol)
  fs.writeFileSync(filePath, serialized.endsWith(eol) ? serialized : `${serialized}${eol}`, 'utf8')
}

function relativeToWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
}

main()
