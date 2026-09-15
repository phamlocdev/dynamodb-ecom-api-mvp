import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider'
import { seedUserAccountForUser } from './user-accounts-seed'
import { getResolvedCognitoUserPoolId, getScriptContext } from './script-helpers'

export type SeedUserAccount = {
  username: string
  email: string
  password: string
  group: 'admin' | 'customer'
  name: string
}

export const defaultSeedUsers: SeedUserAccount[] = [
  {
    username: 'admin',
    email: 'admin@gmail.com',
    password: 'Admin@123',
    group: 'admin',
    name: 'Admin',
  },
  {
    username: 'customer',
    email: 'customer@gmail.com',
    password: 'Customer@123',
    group: 'customer',
    name: 'Customer',
  },
]

export async function ensureSeedUser(
  account: SeedUserAccount,
): Promise<{ sub: string; username: string }> {
  const { cognitoClient } = getScriptContext()
  const userPoolId = getResolvedCognitoUserPoolId()

  if (!userPoolId) {
    throw new Error('Cognito user pool id is missing from both .env.dev and aws-outputs.json.')
  }

  const attributes: AttributeType[] = [
    { Name: 'email', Value: account.email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'name', Value: account.name },
  ]

  const existingUser = await findUserByUsername(account.username)
  if (!existingUser) {
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: account.username,
        MessageAction: 'SUPPRESS',
        UserAttributes: attributes,
      }),
    )
  } else {
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: account.username,
        UserAttributes: attributes,
      }),
    )
  }

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: account.username,
      Password: account.password,
      Permanent: true,
    }),
  )

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: account.username,
      GroupName: account.group,
    }),
  )

  const confirmedUser = await cognitoClient.send(
    new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: account.username,
    }),
  )

  const attributeMap = toAttributeMap(confirmedUser.UserAttributes ?? [])
  const sub = attributeMap.sub
  if (!sub) {
    throw new Error(`User ${account.username} is missing Cognito sub.`)
  }

  await seedUserAccountForUser({
    userId: sub,
    username: account.username,
    email: account.email,
    name: account.name,
    groups: [account.group],
  })

  return { sub, username: account.username }
}

export async function findUserByUsername(username: string): Promise<{ username: string } | null> {
  const { cognitoClient } = getScriptContext()
  const userPoolId = getResolvedCognitoUserPoolId()

  if (!userPoolId) {
    throw new Error('Cognito user pool id is missing from both .env.dev and aws-outputs.json.')
  }

  try {
    const response = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      }),
    )

    return response.Username ? { username: response.Username } : null
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'UserNotFoundException'
    ) {
      return null
    }

    throw error
  }
}

function toAttributeMap(attributes: AttributeType[]): Record<string, string> {
  return attributes.reduce<Record<string, string>>((result, attribute) => {
    if (attribute.Name && attribute.Value) {
      result[attribute.Name] = attribute.Value
    }
    return result
  }, {})
}
