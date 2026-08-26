import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type AttributeType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { AuthenticatedUser } from '../auth/auth.types'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { UploadService } from '../upload/upload.service'
import { UpdateUserProfileDto } from './dto/update-user-profile.dto'
import { CustomerProfile, ManagedUser, UserProfile } from './user.types'

@Injectable()
export class UsersService {
  private readonly userPoolId: string
  private readonly profileTableName: string
  private readonly cognitoClient: CognitoIdentityProviderClient

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(UploadService)
    private readonly uploadService: UploadService,
  ) {
    this.userPoolId = configService.get<string>('COGNITO_USER_POOL_ID') ?? ''
    this.profileTableName = configService.get<string>('USER_PROFILES_TABLE') ?? 'user-profiles'

    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'
    const endpoint = configService.get<string>('COGNITO_IDP_ENDPOINT')
    const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID') ?? 'test'
    const secretAccessKey = configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? 'test'

    this.cognitoClient = new CognitoIdentityProviderClient({
      region,
      ...(endpoint ? { endpoint } : {}),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
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

  private async toManagedUser(user: UserType): Promise<ManagedUser> {
    const groupsResponse = await this.cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: this.userPoolId,
        Username: user.Username ?? '',
      }),
    )

    const attributes = toAttributeMap(user.Attributes ?? [])

    return {
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
      createdAt: user.UserCreateDate?.toISOString(),
      updatedAt: user.UserLastModifiedDate?.toISOString(),
    }
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
    const storedProfile = await this.findStoredProfile(user.sub)
    return this.withAvatarReadUrl(toUserProfile(user, storedProfile))
  }

  async updateOwnProfile(user: AuthenticatedUser, dto: UpdateUserProfileDto): Promise<UserProfile> {
    const storedProfile = await this.findStoredProfile(user.sub)
    const previousAvatarKey = storedProfile?.avatarKey

    if (typeof dto.avatarKey === 'string') {
      if (!this.uploadService.isAvatarKeyForUser(dto.avatarKey, user.sub)) {
        throw new BadRequestException('avatarKey must belong to the authenticated user.')
      }

      await this.uploadService.verifyObjectsExist([dto.avatarKey])
    }

    const timestamp = new Date().toISOString()
    const nextAvatarKey =
      dto.avatarKey === null ? undefined : (dto.avatarKey ?? storedProfile?.avatarKey)
    const nextProfile: UserProfile = {
      userId: user.sub,
      username: user.username,
      ...(user.email ? { email: user.email } : {}),
      ...(dto.name !== undefined
        ? { name: dto.name }
        : storedProfile?.name
          ? { name: storedProfile.name }
          : user.name
            ? { name: user.name }
            : {}),
      ...(nextAvatarKey ? { avatarKey: nextAvatarKey } : {}),
      createdAt: storedProfile?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    await this.dynamoDbService.documentClient.send(
      new PutCommand({
        TableName: this.profileTableName,
        Item: nextProfile,
      }),
    )

    if (previousAvatarKey && previousAvatarKey !== nextAvatarKey) {
      await this.uploadService.deleteObjectsBestEffort([previousAvatarKey])
    }

    return this.withAvatarReadUrl(nextProfile)
  }

  private async findStoredProfile(userId: string): Promise<UserProfile | null> {
    const response = await this.dynamoDbService.documentClient.send(
      new GetCommand({
        TableName: this.profileTableName,
        Key: { userId },
      }),
    )

    return (response.Item as UserProfile | undefined) ?? null
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

function toAttributeMap(attributes: AttributeType[]): Record<string, string> {
  return attributes.reduce<Record<string, string>>((result, attribute) => {
    if (attribute.Name && attribute.Value) {
      result[attribute.Name] = attribute.Value
    }
    return result
  }, {})
}

function toUserProfile(user: AuthenticatedUser, storedProfile: UserProfile | null): UserProfile {
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
