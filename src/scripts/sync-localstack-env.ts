import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { ApiGatewayV2Client, GetApisCommand } from '@aws-sdk/client-apigatewayv2'
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation'
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs'

type StackOutputs = Record<string, string>
type OutputFileShape = Record<string, StackOutputs>

const stackName = 'ServerLocalStack'
const apiName = 'nestjs-ecommerce-local'
const serverRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.resolve(serverRoot, '..')
const outputsPath = path.join(serverRoot, 'localstack-outputs.json')
const serverEnvPath = path.join(serverRoot, '.env')
const clientEnvPath = path.join(workspaceRoot, 'client', '.env')

dotenv.config({
  path: serverEnvPath,
  override: true,
  quiet: true,
})

async function main(): Promise<void> {
  const outputs = await getStackOutputs()
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1'

  updateEnvFile(serverEnvPath, {
    COGNITO_USER_POOL_ID: requireOutput(outputs, 'CognitoUserPoolId'),
    COGNITO_CLIENT_ID: requireOutput(outputs, 'CognitoClientId'),
    PLACE_ORDER_QUEUE_URL: requireOutput(outputs, 'PlaceOrderQueueUrl'),
    RELEASE_RESERVATION_QUEUE_URL: requireOutput(outputs, 'ReleaseReservationQueueUrl'),
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

async function getStackOutputs(): Promise<StackOutputs> {
  const outputs = readOutputs(outputsPath)
  if (outputs) {
    return outputs
  }

  const stackOutputs =
    (await fetchStackOutputsFromCloudFormation()) ?? (await fetchStackOutputsFromServices())
  writeOutputs(outputsPath, stackOutputs)

  return stackOutputs
}

function readOutputs(filePath: string): StackOutputs | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(content) as OutputFileShape
  const stackOutputs = parsed.ServerLocalStack

  if (!stackOutputs) {
    if (Object.keys(parsed).length === 0) {
      return null
    }

    throw new Error(`Could not find ServerLocalStack outputs in ${relativeToWorkspace(filePath)}.`)
  }

  return stackOutputs
}

async function fetchStackOutputsFromCloudFormation(): Promise<StackOutputs | null> {
  const client = new CloudFormationClient(createAwsClientConfig())

  const response = await client.send(new DescribeStacksCommand({ StackName: stackName }))
  const stack = response.Stacks?.[0]

  if (!stack) {
    throw new Error(`Could not find CloudFormation stack "${stackName}" in LocalStack.`)
  }

  const outputs = Object.fromEntries(
    (stack.Outputs ?? [])
      .filter((output) => output.OutputKey && output.OutputValue)
      .map((output) => [output.OutputKey as string, output.OutputValue as string]),
  )

  return Object.keys(outputs).length > 0 ? outputs : null
}

async function fetchStackOutputsFromServices(): Promise<StackOutputs> {
  const region = getRegion()
  const apiGatewayClient = new ApiGatewayV2Client(createAwsClientConfig())
  const cognitoClient = new CognitoIdentityProviderClient(createAwsClientConfig())
  const sqsClient = new SQSClient(createAwsClientConfig())

  const [api, auth, placeOrderQueueUrl, releaseReservationQueueUrl] = await Promise.all([
    resolveHttpApi(apiGatewayClient),
    resolveCognito(cognitoClient),
    resolveQueueUrl(sqsClient, readEnv('PLACE_ORDER_QUEUE_NAME', 'place-order.fifo')),
    resolveQueueUrl(
      sqsClient,
      readEnv('RELEASE_RESERVATION_QUEUE_NAME', 'release-reservation.fifo'),
    ),
  ])

  return {
    DataOrdersEntityType0C1DA821: readEnv('ORDERS_ENTITY_TYPE', 'ORDER'),
    ApiGatewayUrl: ensureTrailingSlash(api.apiEndpoint),
    LocalStackApiGatewayUrl: buildLocalStackApiUrl(api.apiId, api.apiEndpoint),
    CognitoUserPoolId: auth.userPoolId,
    CognitoClientId: auth.clientId,
    CognitoIssuer: `https://cognito-idp.${region}.amazonaws.com/${auth.userPoolId}`,
    LocalStackCognitoIssuer: `${readEnv('LOCALSTACK_COGNITO_BASE_URL', 'http://localhost.localstack.cloud:4566')}/${auth.userPoolId}`,
    HostedUiDomain: `https://${readEnv('COGNITO_DOMAIN_PREFIX', 'dynamodb-mvp-local')}.auth.${region}.amazoncognito.com`,
    PlaceOrderQueueUrl: placeOrderQueueUrl,
    ReleaseReservationQueueUrl: releaseReservationQueueUrl,
  }
}

async function resolveHttpApi(
  client: ApiGatewayV2Client,
): Promise<{ apiId: string; apiEndpoint: string }> {
  const response = await client.send(new GetApisCommand({}))
  const api = response.Items?.find((item) => item.Name === apiName)

  if (!api?.ApiId || !api.ApiEndpoint) {
    throw new Error(`Could not find API Gateway HTTP API "${apiName}" in LocalStack.`)
  }

  return {
    apiId: api.ApiId,
    apiEndpoint: api.ApiEndpoint,
  }
}

async function resolveCognito(
  client: CognitoIdentityProviderClient,
): Promise<{ userPoolId: string; clientId: string }> {
  const userPoolId = await resolveUserPoolId(client)
  const response = await client.send(new ListUserPoolClientsCommand({ UserPoolId: userPoolId }))
  const currentClientId = process.env.COGNITO_CLIENT_ID?.trim()
  const userPoolClient =
    response.UserPoolClients?.find((client) => client.ClientId === currentClientId) ??
    response.UserPoolClients?.[0]

  if (!userPoolClient?.ClientId) {
    throw new Error(`Could not find a Cognito user pool client for user pool "${userPoolId}".`)
  }

  return {
    userPoolId,
    clientId: userPoolClient.ClientId,
  }
}

async function resolveUserPoolId(client: CognitoIdentityProviderClient): Promise<string> {
  const currentUserPoolId = process.env.COGNITO_USER_POOL_ID?.trim()
  if (currentUserPoolId) {
    try {
      const response = await client.send(
        new DescribeUserPoolCommand({ UserPoolId: currentUserPoolId }),
      )
      if (response.UserPool?.Id) {
        return response.UserPool.Id
      }
    } catch {
      // The env file can be stale after a LocalStack reset; fall back to discovery below.
    }
  }

  const response = await client.send(new ListUserPoolsCommand({ MaxResults: 60 }))
  const userPool = response.UserPools?.sort(
    (left, right) =>
      (right.LastModifiedDate?.getTime() ?? 0) - (left.LastModifiedDate?.getTime() ?? 0),
  )[0]

  if (!userPool?.Id) {
    throw new Error('Could not find a Cognito user pool in LocalStack.')
  }

  return userPool.Id
}

async function resolveQueueUrl(client: SQSClient, queueName: string): Promise<string> {
  const response = await client.send(new GetQueueUrlCommand({ QueueName: queueName }))
  if (!response.QueueUrl) {
    throw new Error(`Could not find SQS queue "${queueName}" in LocalStack.`)
  }

  return response.QueueUrl
}

function buildLocalStackApiUrl(apiId: string, apiEndpoint: string): string {
  if (apiEndpoint.includes('localhost.localstack.cloud')) {
    return ensureTrailingSlash(apiEndpoint)
  }

  return `https://${apiId}.execute-api.localhost.localstack.cloud:4566/`
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function writeOutputs(filePath: string, outputs: StackOutputs): void {
  const serialized = JSON.stringify({ [stackName]: outputs }, null, 2)
  fs.writeFileSync(filePath, `${serialized}\n`, 'utf8')
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

function createAwsClientConfig() {
  return {
    endpoint: process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566',
    region: getRegion(),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  }
}

function getRegion(): string {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1'
}

function readEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

void main()
