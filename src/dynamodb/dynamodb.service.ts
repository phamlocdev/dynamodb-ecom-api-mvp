import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb'
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
  private readonly healthCheckTableName?: string

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const settings = getDynamoDbSettings({
      AWS_REGION: configService.get<string>('AWS_REGION'),
      AWS_DEFAULT_REGION: configService.get<string>('AWS_DEFAULT_REGION'),
    })
    this.client = createDynamoDbClient(settings)
    this.documentClient = createDynamoDbDocumentClient(settings)
    this.healthCheckTableName = configService.get<string>('PRODUCTS_TABLE')
  }

  async checkConnection(): Promise<void> {
    if (!this.healthCheckTableName) {
      throw new Error('PRODUCTS_TABLE is required for DynamoDB health check.')
    }

    await this.client.send(new DescribeTableCommand({ TableName: this.healthCheckTableName }))
  }
}
