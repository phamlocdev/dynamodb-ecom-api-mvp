import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SQSClient } from '@aws-sdk/client-sqs'
import { createSqsClient, getSqsSettings } from './sqs.config'

/**
 * SqsService — global NestJS service cung cấp SQSClient đã configured.
 *
 * Pattern tương tự DynamoDbService:
 * - Inject ConfigService để đọc env vars
 * - Expose SQSClient để các service khác (OrdersService) dùng
 *
 * Các service muốn gửi message vào SQS sẽ inject SqsService
 * và gọi: this.sqsService.client.send(new SendMessageCommand({ ... }))
 */
@Injectable()
export class SqsService {
  readonly client: SQSClient

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const settings = getSqsSettings({
      SQS_ENDPOINT: configService.get<string>('SQS_ENDPOINT'),
      AWS_REGION: configService.get<string>('AWS_REGION'),
      AWS_DEFAULT_REGION: configService.get<string>('AWS_DEFAULT_REGION'),
      AWS_ACCESS_KEY_ID: configService.get<string>('AWS_ACCESS_KEY_ID'),
      AWS_SECRET_ACCESS_KEY: configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    })

    this.client = createSqsClient(settings)
  }
}
