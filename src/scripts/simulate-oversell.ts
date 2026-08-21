import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AuthFlowType,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { createDynamoDbDocumentClient, getDynamoDbSettings } from '../dynamodb/dynamodb.config'

type StackOutputs = Record<string, string>
type OutputFileShape = Record<string, StackOutputs>

interface ScriptArgs {
  productId?: string
  customers: number
  timeoutSeconds: number
  inventoryQuantity: number
}

interface TestCustomer {
  username: string
  email: string
  password: string
  accessToken: string
}

interface OrderAttempt {
  customer: TestCustomer
  cartId: string
  orderId: string
}

interface OrderRecord {
  orderId: string
  status: string
  paymentStatus?: string
  failureReason?: string
  totalAmount?: number
}

const serverRoot = path.resolve(__dirname, '..', '..')
const outputsPath = path.join(serverRoot, 'localstack-outputs.json')

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const outputs = readOutputs(outputsPath)
  const apiBaseUrl = normalizeBaseUrl(requireOutput(outputs, 'LocalStackApiGatewayUrl'))
  const userPoolId = requireOutput(outputs, 'CognitoUserPoolId')
  const clientId = requireOutput(outputs, 'CognitoClientId')
  const productId = args.productId ?? (await findFirstActiveProductId(apiBaseUrl))

  console.log(`Using productId=${productId}`)
  await resetInventory(productId, args.inventoryQuantity)
  console.log(`Inventory reset: availableQuantity=${args.inventoryQuantity}, reservedQuantity=0`)

  const cognitoClient = createCognitoClient()
  const runId = Date.now().toString(36)
  const customers = await createAndAuthenticateCustomers(
    cognitoClient,
    userPoolId,
    clientId,
    runId,
    args.customers,
  )
  console.log(`Created/authenticated ${customers.length} customers`)

  const attempts = await Promise.all(
    customers.map((customer) => runCheckoutFlow(apiBaseUrl, customer, productId)),
  )
  console.log(`Submitted ${attempts.length} concurrent place-order requests`)

  const results = await pollOrdersUntilSettled(attempts, args.timeoutSeconds)
  const finalInventory = await getInventory(productId)
  printSummary(productId, attempts, results, finalInventory)

  const successfulOrders = results.filter((order) => order.status === 'RESERVED').length
  if (successfulOrders > 1) {
    process.exitCode = 1
    console.error(`Oversell detected: ${successfulOrders} orders reached RESERVED for stock=1.`)
    return
  }

  console.log('Oversell check passed.')
}

async function createAndAuthenticateCustomers(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  clientId: string,
  runId: string,
  total: number,
): Promise<TestCustomer[]> {
  const customers: TestCustomer[] = []

  for (let index = 0; index < total; index += 1) {
    const suffix = String(index + 1).padStart(2, '0')
    const username = `oversell-${runId}-${suffix}`
    const email = `${username}@example.com`
    const password = `Oversell123!${suffix}`

    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: `Oversell ${suffix}` },
        ],
        MessageAction: 'SUPPRESS',
      }),
    )

    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      }),
    )

    const authResponse = await client.send(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      }),
    )

    const accessToken = authResponse.AuthenticationResult?.AccessToken
    if (!accessToken) {
      throw new Error(`Failed to authenticate customer ${username}.`)
    }

    customers.push({
      username,
      email,
      password,
      accessToken,
    })
  }

  return customers
}

async function runCheckoutFlow(
  apiBaseUrl: string,
  customer: TestCustomer,
  productId: string,
): Promise<OrderAttempt> {
  const cartResponse = await apiRequest<{ cartId: string }>(`${apiBaseUrl}/carts`, {
    method: 'POST',
    token: customer.accessToken,
    body: { ttlDays: 30 },
  })

  await apiRequest(`${apiBaseUrl}/carts/${cartResponse.cartId}/items`, {
    method: 'POST',
    token: customer.accessToken,
    body: { productId, quantity: 1 },
  })

  const orderResponse = await apiRequest<{ orderId: string }>(`${apiBaseUrl}/orders`, {
    method: 'POST',
    token: customer.accessToken,
    body: { cartId: cartResponse.cartId },
  })

  return {
    customer,
    cartId: cartResponse.cartId,
    orderId: orderResponse.orderId,
  }
}

async function pollOrdersUntilSettled(
  attempts: OrderAttempt[],
  timeoutSeconds: number,
): Promise<OrderRecord[]> {
  const deadline = Date.now() + timeoutSeconds * 1000

  while (Date.now() < deadline) {
    const orders = await Promise.all(attempts.map((attempt) => getOrder(attempt.orderId)))
    if (orders.every((order) => order.status !== 'PENDING')) {
      return orders
    }
    await wait(1000)
  }

  return Promise.all(attempts.map((attempt) => getOrder(attempt.orderId)))
}

async function getOrder(orderId: string): Promise<OrderRecord> {
  const client = createDynamoDbDocumentClient(getDynamoDbSettings())
  const tableName = process.env.ORDERS_TABLE ?? 'orders'
  const response = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { orderId },
    }),
  )

  if (!response.Item) {
    throw new Error(`Order ${orderId} was not found.`)
  }

  return response.Item as OrderRecord
}

async function resetInventory(productId: string, quantity: number): Promise<void> {
  const client = createDynamoDbDocumentClient(getDynamoDbSettings())
  const tableName = process.env.INVENTORY_TABLE ?? 'inventory'

  await client.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { productId },
      UpdateExpression:
        'SET #availableQuantity = :availableQuantity, #reservedQuantity = :reservedQuantity, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#availableQuantity': 'availableQuantity',
        '#reservedQuantity': 'reservedQuantity',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':availableQuantity': quantity,
        ':reservedQuantity': 0,
        ':updatedAt': new Date().toISOString(),
      },
    }),
  )
}

async function getInventory(productId: string): Promise<Record<string, unknown>> {
  const client = createDynamoDbDocumentClient(getDynamoDbSettings())
  const tableName = process.env.INVENTORY_TABLE ?? 'inventory'
  const response = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { productId },
    }),
  )

  return (response.Item as Record<string, unknown> | undefined) ?? {}
}

async function findFirstActiveProductId(apiBaseUrl: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/products?limit=1&status=ACTIVE`)
  if (!response.ok) {
    throw new Error(`Failed to load products: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { items?: Array<{ productId?: string }> }
  const productId = payload.items?.[0]?.productId
  if (!productId) {
    throw new Error('Could not find an ACTIVE product to test.')
  }

  return productId
}

async function apiRequest<T = unknown>(
  url: string,
  options: {
    method: 'POST' | 'GET'
    token: string
    body?: Record<string, unknown>
  },
): Promise<T> {
  const response = await fetch(url, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${options.method} ${url} failed: ${response.status} ${response.statusText} ${body}`)
  }

  return (await response.json()) as T
}

function printSummary(
  productId: string,
  attempts: OrderAttempt[],
  results: OrderRecord[],
  inventory: Record<string, unknown>,
): void {
  const counters = results.reduce<Record<string, number>>((accumulator, order) => {
    accumulator[order.status] = (accumulator[order.status] ?? 0) + 1
    return accumulator
  }, {})

  console.log('')
  console.log('Oversell simulation summary')
  console.log(`productId: ${productId}`)
  console.log(`orders placed: ${attempts.length}`)
  console.log(`status counts: ${JSON.stringify(counters, null, 2)}`)
  console.log(`inventory: ${JSON.stringify(inventory, null, 2)}`)
  console.log('')

  results.forEach((order, index) => {
    const attempt = attempts[index]
    console.log(
      [
        `${attempt.customer.username}`,
        `orderId=${order.orderId}`,
        `status=${order.status}`,
        `paymentStatus=${order.paymentStatus ?? 'n/a'}`,
        order.failureReason ? `failureReason=${order.failureReason}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
    )
  })
}

function parseArgs(args: string[]): ScriptArgs {
  const values: ScriptArgs = {
    customers: 10,
    timeoutSeconds: 45,
    inventoryQuantity: 1,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--productId' && next) {
      values.productId = next
      index += 1
    } else if (arg === '--customers' && next) {
      values.customers = Number(next)
      index += 1
    } else if (arg === '--timeoutSeconds' && next) {
      values.timeoutSeconds = Number(next)
      index += 1
    } else if (arg === '--inventoryQuantity' && next) {
      values.inventoryQuantity = Number(next)
      index += 1
    }
  }

  return values
}

function readOutputs(filePath: string): StackOutputs {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${path.relative(serverRoot, filePath)}. Run infra:deploy first.`)
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(content) as OutputFileShape
  const stackOutputs = parsed.ServerLocalStack

  if (!stackOutputs) {
    throw new Error(`Could not find ServerLocalStack outputs in ${path.relative(serverRoot, filePath)}.`)
  }

  return stackOutputs
}

function requireOutput(outputs: StackOutputs, key: string): string {
  const value = outputs[key]
  if (!value) {
    throw new Error(`Missing output "${key}" in ${path.relative(serverRoot, outputsPath)}.`)
  }

  return value
}

function createCognitoClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1',
    ...(process.env.COGNITO_IDP_ENDPOINT ? { endpoint: process.env.COGNITO_IDP_ENDPOINT } : {}),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  })
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

void main().catch((error: unknown) => {
  console.error('Failed to simulate oversell scenario.', error)
  process.exitCode = 1
})
