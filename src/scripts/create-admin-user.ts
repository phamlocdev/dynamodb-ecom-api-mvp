import 'dotenv/config'
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const username = args.username ?? process.env.ADMIN_USERNAME
  const email = args.email ?? process.env.ADMIN_EMAIL
  const password = args.password ?? process.env.ADMIN_PASSWORD
  const userPoolId = process.env.COGNITO_USER_POOL_ID

  if (!username || !email || !password || !userPoolId) {
    throw new Error(
      'Missing required values. Provide --username, --email, --password and set COGNITO_USER_POOL_ID in server/.env.',
    )
  }

  const client = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-southeast-1',
    ...(process.env.COGNITO_IDP_ENDPOINT ? { endpoint: process.env.COGNITO_IDP_ENDPOINT } : {}),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  })

  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
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

  await client.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: username,
      GroupName: 'admin',
    }),
  )

  console.log(`Created admin user "${username}" and added it to the admin group.`)
}

function parseArgs(args: string[]): Record<string, string> {
  const values: Record<string, string> = {}
  const positional: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--username' && next) {
      values.username = next
      index += 1
    } else if (arg === '--email' && next) {
      values.email = next
      index += 1
    } else if (arg === '--password' && next) {
      values.password = next
      index += 1
    } else if (!arg.startsWith('--')) {
      positional.push(arg)
    }
  }

  values.username ??= positional[0]
  values.email ??= positional[1]
  values.password ??= positional[2]

  return values
}

void main().catch((error: unknown) => {
  console.error('Failed to create admin user.', error)
  process.exitCode = 1
})
