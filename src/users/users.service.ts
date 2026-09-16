import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type AttributeType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { normalizePermissions, Permission } from '../auth/permissions'
import { AuthenticatedUser } from '../auth/auth.types'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { EmailTrackingService } from '../mail/email-tracking.service'
import { EmailDeliveryStatistics, EmailTrackingView } from '../mail/mail.types'
import { SesMailService } from '../mail/ses-mail.service'
import { UploadService } from '../upload/upload.service'
import { CreateManagedUserDto } from './dto/create-managed-user.dto'
import { UpdateManagedUserDto } from './dto/update-managed-user.dto'
import { UpdateUserProfileDto } from './dto/update-user-profile.dto'
import {
  CustomerProfile,
  ManagedUser,
  ResendUserEmailResult,
  UserAccount,
  UserPermissionsRecord,
  UserProfile,
} from './user.types'

@Injectable()
export class UsersService {
  private readonly userPoolId: string
  private readonly userAccountsTableName: string
  private readonly cognitoClient: CognitoIdentityProviderClient

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(EmailTrackingService)
    private readonly emailTrackingService: EmailTrackingService,
    @Inject(SesMailService)
    private readonly sesMailService: SesMailService,
    @Inject(UploadService)
    private readonly uploadService: UploadService,
  ) {
    this.userPoolId = configService.get<string>('COGNITO_USER_POOL_ID') ?? ''
    this.userAccountsTableName = configService.get<string>('USER_ACCOUNTS_TABLE') ?? 'user-accounts'

    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'
    this.cognitoClient = new CognitoIdentityProviderClient({
      region,
    })
  }

  async findAll(): Promise<ManagedUser[]> {
    const users: UserType[] = []
    let paginationToken: string | undefined

    do {
      const response = await this.cognitoClient.send(
        new ListUsersCommand({
          UserPoolId: this.userPoolId,
          PaginationToken: paginationToken,
          Limit: 60,
        }),
      )

      users.push(...(response.Users ?? []))
      paginationToken = response.PaginationToken
    } while (paginationToken)

    return Promise.all(users.map((user) => this.toManagedUser(user)))
  }

  async createManagedUser(
    actor: AuthenticatedUser,
    dto: CreateManagedUserDto,
  ): Promise<ManagedUser> {
    const attributes: AttributeType[] = [
      { Name: 'email', Value: dto.email },
      { Name: 'email_verified', Value: 'true' },
    ]
    if (dto.name) {
      attributes.push({ Name: 'name', Value: dto.name })
    }

    try {
      await this.cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: dto.username,
          MessageAction: 'SUPPRESS',
          UserAttributes: attributes,
        }),
      )
    } catch (error) {
      if (isCognitoError(error, 'UsernameExistsException')) {
        throw new ConflictException(`User ${dto.username} already exists.`)
      }
      throw error
    }

    await this.cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: dto.username,
        Password: dto.password,
        // Permanent: true,
        Permanent: false, // Set to false to allow the user to change their password on first login
      }),
    )

    await this.cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: dto.username,
        GroupName: dto.group,
      }),
    )

    const user = await this.findManagedUserByUsername(dto.username)
    if (user.sub) {
      await this.putUserAccount({
        userId: user.sub,
        username: user.username,
        email: user.email,
        name: user.name,
        permissions: normalizePermissions(dto.permissions),
      })
    }

    return this.findManagedUserByUsername(dto.username)
  }

  async updateManagedUser(userId: string, dto: UpdateManagedUserDto): Promise<ManagedUser> {
    const user = await this.findManagedUserBySub(userId)

    const userAttributes: AttributeType[] = []
    if (dto.email !== undefined) {
      userAttributes.push({ Name: 'email', Value: dto.email })
      userAttributes.push({ Name: 'email_verified', Value: 'true' })
    }
    if (dto.name !== undefined) {
      userAttributes.push({ Name: 'name', Value: dto.name })
    }

    if (userAttributes.length > 0) {
      await this.cognitoClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: this.userPoolId,
          Username: user.username,
          UserAttributes: userAttributes,
        }),
      )

      await this.putUserAccount({
        userId,
        username: user.username,
        email: dto.email ?? user.email,
        name: dto.name ?? user.name,
        permissions: user.permissions,
      })
    }

    if (dto.enabled === true && !user.enabled) {
      await this.cognitoClient.send(
        new AdminEnableUserCommand({
          UserPoolId: this.userPoolId,
          Username: user.username,
        }),
      )
    } else if (dto.enabled === false && user.enabled) {
      await this.disableManagedUser(userId)
    }

    return this.findManagedUserBySub(userId)
  }

  async disableManagedUser(userId: string): Promise<void> {
    const user = await this.findManagedUserBySub(userId)
    await this.cognitoClient.send(
      new AdminDisableUserCommand({
        UserPoolId: this.userPoolId,
        Username: user.username,
      }),
    )
  }

  async updateUserPermissions(
    userId: string,
    permissions: Permission[],
    actor: AuthenticatedUser,
  ): Promise<UserPermissionsRecord> {
    void actor
    await this.findManagedUserBySub(userId)
    const record = await this.putUserAccount({
      userId,
      permissions: normalizePermissions(permissions),
    })

    return toUserPermissionsRecord(record)
  }

  async resetManagedUserPassword(userId: string, password: string): Promise<void> {
    const user = await this.findManagedUserBySub(userId)

    await this.cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: user.username,
        Password: password,
        Permanent: false,
      }),
    )
  }

  async setOwnPassword(user: AuthenticatedUser, password: string): Promise<void> {
    const response = await this.cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: user.username,
      }),
    )
    const attributes = toAttributeMap(response.UserAttributes ?? [])

    if (attributes.email_verified !== 'true') {
      throw new BadRequestException('Your email must be verified before setting a password.')
    }

    await this.cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: user.username,
        Password: password,
        Permanent: true,
      }),
    )
  }

  async getWelcomeEmailStatistics(): Promise<EmailDeliveryStatistics> {
    return this.emailTrackingService.getStatistics(['WELCOME_NEW_CUSTOMER'])
  }

  async getWelcomeEmailTracking(userId: string): Promise<EmailTrackingView[]> {
    await this.findManagedUserBySub(userId)
    return this.emailTrackingService.findByContext('USER', userId, ['WELCOME_NEW_CUSTOMER'])
  }

  async resendFailedWelcomeEmail(
    userId: string,
    recipientEmail: string,
  ): Promise<ResendUserEmailResult> {
    const user = await this.findManagedUserBySub(userId)
    const normalizedRecipientEmail = normalizeEmail(recipientEmail)
    if (!normalizedRecipientEmail) {
      throw new BadRequestException('recipientEmail is required.')
    }

    const retryableItem = await this.emailTrackingService.findLatestRetryableForRecipient({
      contextType: 'USER',
      contextId: userId,
      emailType: 'WELCOME_NEW_CUSTOMER',
      recipientEmail: normalizedRecipientEmail,
    })

    if (!retryableItem) {
      return {
        userId,
        emailType: 'WELCOME_NEW_CUSTOMER',
        recipientEmails: [],
        resentCount: 0,
        status: 'SKIPPED',
        reason: 'no-retryable-recipients',
      }
    }

    const recipientEmails = [normalizedRecipientEmail]
    const result = await this.sesMailService.sendWelcomeNewCustomerEmail({
      user,
      recipientEmails,
      resendOfByRecipient: {
        [normalizedRecipientEmail]: retryableItem.emailId,
      },
    })

    return {
      userId,
      emailType: 'WELCOME_NEW_CUSTOMER',
      recipientEmails,
      resentCount: recipientEmails.length,
      status: result.status,
      reason: result.reason,
    }
  }

  private async toManagedUser(user: UserType): Promise<ManagedUser> {
    const groupsResponse = await this.cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: this.userPoolId,
        Username: user.Username ?? '',
      }),
    )

    const attributes = toAttributeMap(user.Attributes ?? [])

    const managedUser: ManagedUser = {
      username: user.Username ?? '',
      enabled: user.Enabled ?? false,
      status: user.UserStatus,
      name: attributes.name,
      sub: attributes.sub,
      email: attributes.email,
      emailVerified: attributes.email_verified === 'true',
      groups: (groupsResponse.Groups ?? []).flatMap((group) =>
        group.GroupName ? [group.GroupName] : [],
      ),
      permissions: [],
      createdAt: user.UserCreateDate?.toISOString(),
      updatedAt: user.UserLastModifiedDate?.toISOString(),
    }

    if (managedUser.sub) {
      managedUser.permissions = await this.findUserPermissions(managedUser.sub)
      managedUser.welcomeEmailTracking = await this.emailTrackingService.getLatestSummary(
        'USER',
        managedUser.sub,
        'WELCOME_NEW_CUSTOMER',
      )
    }

    return managedUser
  }

  private async findManagedUserByUsername(username: string): Promise<ManagedUser> {
    const response = await this.cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: username,
      }),
    )

    const user: UserType = {
      Username: response.Username,
      Enabled: response.Enabled,
      UserStatus: response.UserStatus,
      UserCreateDate: response.UserCreateDate,
      UserLastModifiedDate: response.UserLastModifiedDate,
      Attributes: response.UserAttributes,
    }
    return this.toManagedUser(user)
  }

  private async findManagedUserBySub(userId: string): Promise<ManagedUser> {
    const users = await this.findAll()
    const user = users.find((item) => item.sub === userId)
    if (!user) {
      throw new NotFoundException(`User ${userId} was not found.`)
    }
    return user
  }

  private async findUserPermissions(userId: string): Promise<Permission[]> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.userAccountsTableName,
        Key: { userId },
      }),
    )

    const record = response.Item as UserAccount | undefined
    return normalizePermissions(record?.permissions)
  }

  private async putUserAccount(
    input: Pick<UserAccount, 'userId'> &
      Partial<Pick<UserAccount, 'username' | 'email' | 'name' | 'permissions'>> & {
        avatarKey?: string | null
      },
  ): Promise<UserAccount> {
    const existingResponse = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.userAccountsTableName,
        Key: { userId: input.userId },
      }),
    )
    const existing = existingResponse.Item as UserAccount | undefined
    const timestamp = new Date().toISOString()
    const record: UserAccount = {
      userId: input.userId,
      username: input.username ?? existing?.username ?? input.userId,
      ...(input.email !== undefined
        ? { email: input.email }
        : existing?.email
          ? { email: existing.email }
          : {}),
      ...(input.name !== undefined
        ? { name: input.name }
        : existing?.name
          ? { name: existing.name }
          : {}),
      ...(input.avatarKey === null
        ? {}
        : input.avatarKey !== undefined
          ? { avatarKey: input.avatarKey }
          : existing?.avatarKey
            ? { avatarKey: existing.avatarKey }
            : {}),
      permissions: normalizePermissions(input.permissions ?? existing?.permissions),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.userAccountsTableName,
        Item: record,
      }),
    )

    return record
  }

  async findCustomerProfileByUsername(username: string): Promise<CustomerProfile> {
    const response = await this.cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: username,
      }),
    )

    const attributes = toAttributeMap(response.UserAttributes ?? [])
    return {
      username,
      email: attributes.email,
      name: attributes.name,
      sub: attributes.sub,
    }
  }

  async getOwnProfile(user: AuthenticatedUser): Promise<UserProfile> {
    const account = await this.findStoredAccount(user.sub)
    return this.withAvatarReadUrl(toUserProfile(user, account))
  }

  async updateOwnProfile(user: AuthenticatedUser, dto: UpdateUserProfileDto): Promise<UserProfile> {
    const account = await this.findStoredAccount(user.sub)
    const previousAvatarKey = account?.avatarKey

    if (typeof dto.avatarKey === 'string') {
      if (!this.uploadService.isAvatarKeyForUser(dto.avatarKey, user.sub)) {
        throw new BadRequestException('avatarKey must belong to the authenticated user.')
      }

      await this.uploadService.verifyObjectsExist([dto.avatarKey])
    }

    const nextAvatarKey = dto.avatarKey === null ? null : (dto.avatarKey ?? account?.avatarKey)
    const nextAccount = await this.putUserAccount({
      userId: user.sub,
      username: user.username,
      email: user.email,
      name: dto.name !== undefined ? dto.name : (account?.name ?? user.name),
      avatarKey: nextAvatarKey,
      permissions: account?.permissions ?? [],
    })

    if (previousAvatarKey && previousAvatarKey !== nextAvatarKey) {
      await this.uploadService.deleteObjectsBestEffort([previousAvatarKey])
    }

    return this.withAvatarReadUrl(toUserProfile(user, nextAccount))
  }

  private async findStoredAccount(userId: string): Promise<UserAccount | null> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.userAccountsTableName,
        Key: { userId },
      }),
    )

    return (response.Item as UserAccount | undefined) ?? null
  }

  private async withAvatarReadUrl(profile: UserProfile): Promise<UserProfile> {
    if (!profile.avatarKey) {
      return profile
    }

    const [readUrl] = await this.uploadService.createReadUrls([profile.avatarKey])
    return {
      ...profile,
      avatarReadUrl: readUrl.readUrl,
      avatarReadUrlExpiresInSeconds: readUrl.expiresInSeconds,
    }
  }
}

function isCognitoError(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name
}

function toAttributeMap(attributes: AttributeType[]): Record<string, string> {
  return attributes.reduce<Record<string, string>>((result, attribute) => {
    if (attribute.Name && attribute.Value) {
      result[attribute.Name] = attribute.Value
    }
    return result
  }, {})
}

function normalizeEmail(email: string | undefined): string | undefined {
  const normalizedEmail = email?.trim().toLowerCase()
  return normalizedEmail || undefined
}

function toUserProfile(user: AuthenticatedUser, storedProfile: UserAccount | null): UserProfile {
  const timestamp = new Date().toISOString()

  return {
    userId: user.sub,
    username: user.username,
    ...(user.email ? { email: user.email } : {}),
    ...(storedProfile?.name ? { name: storedProfile.name } : user.name ? { name: user.name } : {}),
    ...(storedProfile?.avatarKey ? { avatarKey: storedProfile.avatarKey } : {}),
    createdAt: storedProfile?.createdAt ?? timestamp,
    updatedAt: storedProfile?.updatedAt ?? timestamp,
  }
}

function toUserPermissionsRecord(account: UserAccount): UserPermissionsRecord {
  return {
    userId: account.userId,
    permissions: normalizePermissions(account.permissions),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}
