import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { z } from 'zod'

const vnpaySecretSchema = z.object({
  tmnCode: z.string().trim().min(1),
  secureSecret: z.string().trim().min(1),
})

export type VnpaySecret = z.infer<typeof vnpaySecretSchema>

@Injectable()
export class VnpaySecretsService {
  private readonly client = new SecretsManagerClient({})
  private readonly secretName: string
  private cachedSecretPromise?: Promise<VnpaySecret>

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.secretName = configService.getOrThrow<string>('VNPAY_SECRET_NAME')
  }

  getSecret(): Promise<VnpaySecret> {
    this.cachedSecretPromise ??= this.loadSecret()
    return this.cachedSecretPromise
  }

  private async loadSecret(): Promise<VnpaySecret> {
    const response = await this.client.send(
      new GetSecretValueCommand({
        SecretId: this.secretName,
      }),
    )

    if (!response.SecretString) {
      throw new Error(`Secrets Manager secret ${this.secretName} does not contain SecretString.`)
    }

    const parsed = JSON.parse(response.SecretString) as unknown
    return vnpaySecretSchema.parse(parsed)
  }
}
