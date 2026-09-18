import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name)
  private readonly client: SecretsManagerClient
  private readonly secretCache = new Map<string, Promise<string>>()

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.client = new SecretsManagerClient({
      region:
        configService.get<string>('AWS_REGION') ??
        configService.get<string>('AWS_DEFAULT_REGION') ??
        'ap-southeast-1',
    })
  }

  getSecretString(secretId: string): Promise<string> {
    const cachedSecret = this.secretCache.get(secretId)
    if (cachedSecret) {
      return cachedSecret
    }

    const secretPromise = this.fetchSecretString(secretId).catch((error) => {
      this.secretCache.delete(secretId)
      throw error
    })
    this.secretCache.set(secretId, secretPromise)

    return secretPromise
  }

  private async fetchSecretString(secretId: string): Promise<string> {
    this.logger.debug(`Loading secret ${secretId} from AWS Secrets Manager.`)

    const response = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }))
    if (typeof response.SecretString === 'string' && response.SecretString.length > 0) {
      return response.SecretString
    }

    if (response.SecretBinary) {
      return Buffer.from(response.SecretBinary).toString('utf8')
    }

    throw new Error(`Secret ${secretId} does not contain a secret string or binary value.`)
  }
}
