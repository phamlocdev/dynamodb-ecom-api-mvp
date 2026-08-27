import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ListTablesCommand } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  createDynamoDbClient,
  createDynamoDbDocumentClient,
  getDynamoDbSettings,
} from './dynamodb.config'

@Injectable()
export class DynamoDbService {
  readonly documentClient: DynamoDBDocumentClient

  private readonly client

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const settings = getDynamoDbSettings({
      AWS_REGION: configService.get<string>('AWS_REGION'),
      AWS_DEFAULT_REGION: configService.get<string>('AWS_DEFAULT_REGION'),
    })
    this.client = createDynamoDbClient(settings)
    this.documentClient = createDynamoDbDocumentClient(settings)
  }

  async checkConnection(): Promise<void> {
    await this.client.send(new ListTablesCommand({ Limit: 1 }))
  }
}
