import {
  AdminListGroupsForUserCommand,
  ListUsersCommand,
  type AttributeType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { ResourceNotFoundException } from '@aws-sdk/client-dynamodb'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import {
  ADMIN_PERMISSIONS,
  CUSTOMER_PERMISSIONS,
  MANAGER_PERMISSIONS,
  normalizePermissions,
  type Permission,
} from '../auth/permissions'
import { Role } from '../auth/roles.enum'
import {
  getLegacyUserAccessTableName,
  getLegacyUserProfilesTableName,
  getResolvedCognitoUserPoolId,
  getResolvedUserAccountsTableName,
  getScriptContext,
  nowIso,
} from './script-helpers'

export type SeedUserAccountResult = {
  userId: string
  username: string
  permissions: Permission[]
}

type StoredUserAccount = {
  userId: string
  username: string
  email?: string
  name?: string
  avatarKey?: string
  permissions: Permission[]
  createdAt: string
  updatedAt: string
}

type LegacyUserProfile = {
  userId: string
  username?: string
  email?: string
  name?: string
  avatarKey?: string
  createdAt?: string
  updatedAt?: string
}

type LegacyUserAccess = {
  userId: string
  permissions?: unknown
  createdAt?: string
  updatedAt?: string
}

export async function seedAllUserAccounts(): Promise<SeedUserAccountResult[]> {
  const { cognitoClient } = getScriptContext()
  const userPoolId = getResolvedCognitoUserPoolId()
  const users: UserType[] = []
  let paginationToken: string | undefined

  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        PaginationToken: paginationToken,
        Limit: 60,
      }),
    )
    users.push(...(response.Users ?? []))
    paginationToken = response.PaginationToken
  } while (paginationToken)

  return Promise.all(
    users.map(async (user) => {
      const username = user.Username ?? ''
      const attributes = toAttributeMap(user.Attributes ?? [])
      const sub = attributes.sub
      if (!username || !sub) {
        throw new Error(`Cannot seed account for user without username or sub: ${username}`)
      }

      const groups = await findUserGroups(username)
      const account = await putUserAccount({
        userId: sub,
        username,
        email: attributes.email,
        name: attributes.name,
        permissions: defaultPermissionsForGroups(groups),
      })

      return { userId: sub, username, permissions: account.permissions }
    }),
  )
}

export async function backfillUserAccounts(): Promise<SeedUserAccountResult[]> {
  const { cognitoClient } = getScriptContext()
  const userPoolId = getResolvedCognitoUserPoolId()
  const users: UserType[] = []
  let paginationToken: string | undefined

  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        PaginationToken: paginationToken,
        Limit: 60,
      }),
    )
    users.push(...(response.Users ?? []))
    paginationToken = response.PaginationToken
  } while (paginationToken)

  return Promise.all(
    users.map(async (user) => {
      const username = user.Username ?? ''
      const attributes = toAttributeMap(user.Attributes ?? [])
      const sub = attributes.sub
      if (!username || !sub) {
        throw new Error(`Cannot backfill account for user without username or sub: ${username}`)
      }

      const [groups, legacyProfile, legacyAccess] = await Promise.all([
        findUserGroups(username),
        findLegacyProfile(sub),
        findLegacyAccess(sub),
      ])
      const permissions = legacyAccess?.permissions
        ? normalizePermissions(legacyAccess.permissions)
        : defaultPermissionsForGroups(groups)
      const account = await putUserAccount({
        userId: sub,
        username: legacyProfile?.username ?? username,
        email: legacyProfile?.email ?? attributes.email,
        name: legacyProfile?.name ?? attributes.name,
        avatarKey: legacyProfile?.avatarKey,
        permissions,
        createdAt: legacyProfile?.createdAt ?? legacyAccess?.createdAt,
      })

      return { userId: sub, username, permissions: account.permissions }
    }),
  )
}

export async function seedUserAccountForUser(input: {
  userId: string
  username: string
  email?: string
  name?: string
  groups: string[]
}): Promise<StoredUserAccount> {
  return putUserAccount({
    userId: input.userId,
    username: input.username,
    email: input.email,
    name: input.name,
    permissions: defaultPermissionsForGroups(input.groups),
  })
}

export function defaultPermissionsForGroups(groups: string[]): Permission[] {
  if (groups.includes(Role.ADMIN)) {
    return [...ADMIN_PERMISSIONS]
  }

  if (groups.includes(Role.MANAGER)) {
    return [...MANAGER_PERMISSIONS]
  }

  return [...CUSTOMER_PERMISSIONS]
}

async function putUserAccount(
  input: Pick<StoredUserAccount, 'userId' | 'username'> &
    Partial<Pick<StoredUserAccount, 'email' | 'name' | 'avatarKey' | 'permissions' | 'createdAt'>>,
): Promise<StoredUserAccount> {
  const { documentClient } = getScriptContext()
  const tableName = getResolvedUserAccountsTableName()
  const timestamp = nowIso()
  const record: StoredUserAccount = {
    userId: input.userId,
    username: input.username,
    ...(input.email ? { email: input.email } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.avatarKey ? { avatarKey: input.avatarKey } : {}),
    permissions: normalizePermissions(input.permissions),
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  try {
    await documentClient.send(
      new PutCommand({
        TableName: tableName,
        Item: record,
      }),
    )
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      throw new Error(
        `User accounts table "${tableName}" was not found. Run npm run infra:deploy before seeding user accounts.`,
      )
    }
    throw error
  }

  return record
}

async function findUserGroups(username: string): Promise<string[]> {
  const { cognitoClient } = getScriptContext()
  const response = await cognitoClient.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: getResolvedCognitoUserPoolId(),
      Username: username,
    }),
  )

  return (response.Groups ?? []).flatMap((group) => (group.GroupName ? [group.GroupName] : []))
}

async function findLegacyProfile(userId: string): Promise<LegacyUserProfile | undefined> {
  const tableName = getLegacyUserProfilesTableName()
  if (!tableName) {
    return undefined
  }

  return findLegacyItem<LegacyUserProfile>(tableName, userId)
}

async function findLegacyAccess(userId: string): Promise<LegacyUserAccess | undefined> {
  const tableName = getLegacyUserAccessTableName()
  if (!tableName) {
    return undefined
  }

  return findLegacyItem<LegacyUserAccess>(tableName, userId)
}

async function findLegacyItem<TItem>(
  tableName: string,
  userId: string,
): Promise<TItem | undefined> {
  const { documentClient } = getScriptContext()
  try {
    const response = await documentClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { userId },
      }),
    )
    return response.Item as TItem | undefined
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return undefined
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
