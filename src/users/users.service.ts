import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type AttributeType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { CustomerProfile, ManagedUser } from './user.types'

@Injectable()
export class UsersService {
  private readonly userPoolId: string
  private readonly cognitoClient: CognitoIdentityProviderClient

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.userPoolId = configService.get<string>('COGNITO_USER_POOL_ID') ?? ''

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
}

function toAttributeMap(attributes: AttributeType[]): Record<string, string> {
  return attributes.reduce<Record<string, string>>((result, attribute) => {
    if (attribute.Name && attribute.Value) {
      result[attribute.Name] = attribute.Value
    }
    return result
  }, {})
}
