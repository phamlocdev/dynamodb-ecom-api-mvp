import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { EmailDeliveryStatus, EmailTracking } from './mail.types'

const ORDER_CONFIRMATION_EMAIL_TYPE = 'ORDER_CONFIRMATION' as const
const ORDER_CONTEXT_TYPE = 'ORDER' as const

@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name)
  private readonly tableName: string

  constructor(
    @Inject(DynamoDbService)
    private readonly dynamoDbService: DynamoDbService,
    @Inject(ConfigService)
    configService: ConfigService,
  ) {
    this.tableName = configService.get<string>('EMAIL_TRACKING_TABLE') ?? 'email-tracking'
  }

  async hasActiveOrderConfirmationTracking(orderId: string): Promise<boolean> {
    const response = await this.dynamoDbService.documentClient.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: '#contextKey = :contextKey AND #emailType = :emailType',
        ExpressionAttributeNames: {
          '#contextKey': 'contextKey',
          '#emailType': 'emailType',
        },
        ExpressionAttributeValues: {
          ':contextKey': buildOrderContextKey(orderId),
          ':emailType': ORDER_CONFIRMATION_EMAIL_TYPE,
        },
      }),
    )

    const items = (response.Items ?? []) as EmailTracking[]
    return items.some(
      (item) =>
        item.emailType === ORDER_CONFIRMATION_EMAIL_TYPE && item.status !== 'FAILED',
    )
  }

  async createOrderConfirmationTrackingItems(input: {
    orderId: string
    recipientEmails: string[]
    status: EmailDeliveryStatus
    configurationSetName?: string
    failureReason?: string
  }): Promise<EmailTracking[]> {
    const createdAt = new Date().toISOString()
    const contextKey = buildOrderContextKey(input.orderId)
    const attemptNumber = await this.resolveNextAttemptNumber(input.orderId)
    const items = input.recipientEmails.map((recipientEmail) => ({
      emailId: randomUUID(),
      emailType: ORDER_CONFIRMATION_EMAIL_TYPE,
      recipientEmail,
      status: input.status,
      contextType: ORDER_CONTEXT_TYPE,
      contextId: input.orderId,
      contextKey,
      attemptNumber,
      configurationSetName: input.configurationSetName,
      failureReason: input.failureReason,
      createdAt,
      updatedAt: createdAt,
      ...(input.status === 'FAILED' ? { failedAt: createdAt } : {}),
    }))

    await Promise.all(
      items.map((item) =>
        this.dynamoDbService.documentClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(#emailId)',
            ExpressionAttributeNames: { '#emailId': 'emailId' },
          }),
        ),
      ),
    )

    return items
  }

  async markSent(emailIds: string[], sesMessageId: string | undefined): Promise<void> {
    const sentAt = new Date().toISOString()
    await Promise.all(
      emailIds.map((emailId) => {
        const expressionAttributeNames: Record<string, string> = {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
          '#sentAt': 'sentAt',
          '#failureReason': 'failureReason',
          '#failedAt': 'failedAt',
        }
        const expressionAttributeValues: Record<string, unknown> = {
          ':status': 'SENT',
          ':updatedAt': sentAt,
          ':sentAt': sentAt,
        }
        let updateExpression =
          'SET #status = :status, #updatedAt = :updatedAt, #sentAt = :sentAt'

        if (sesMessageId) {
          expressionAttributeNames['#sesMessageId'] = 'sesMessageId'
          expressionAttributeValues[':sesMessageId'] = sesMessageId
          updateExpression += ', #sesMessageId = :sesMessageId'
        }

        return this.dynamoDbService.documentClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { emailId },
            UpdateExpression: `${updateExpression} REMOVE #failureReason, #failedAt`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
          }),
        )
      }),
    )
  }

  async markFailed(emailIds: string[], failureReason: string): Promise<void> {
    const failedAt = new Date().toISOString()
    await Promise.all(
      emailIds.map((emailId) =>
        this.dynamoDbService.documentClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { emailId },
            UpdateExpression:
              'SET #status = :status, #failureReason = :failureReason, #updatedAt = :updatedAt, #failedAt = :failedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#failureReason': 'failureReason',
              '#updatedAt': 'updatedAt',
              '#failedAt': 'failedAt',
            },
            ExpressionAttributeValues: {
              ':status': 'FAILED',
              ':failureReason': failureReason,
              ':updatedAt': failedAt,
              ':failedAt': failedAt,
            },
          }),
        ),
      ),
    )
  }

  logTrackingSkipped(orderId: string, reason: string): void {
    this.logger.warn(`Skipped email tracking for order ${orderId}: ${reason}.`)
  }

  private async resolveNextAttemptNumber(orderId: string): Promise<number> {
    const response = await this.dynamoDbService.documentClient.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: '#contextKey = :contextKey AND #emailType = :emailType',
        ExpressionAttributeNames: {
          '#contextKey': 'contextKey',
          '#emailType': 'emailType',
        },
        ExpressionAttributeValues: {
          ':contextKey': buildOrderContextKey(orderId),
          ':emailType': ORDER_CONFIRMATION_EMAIL_TYPE,
        },
      }),
    )

    const items = (response.Items ?? []) as EmailTracking[]
    const maxAttemptNumber = items.reduce(
      (max, item) =>
        item.emailType === ORDER_CONFIRMATION_EMAIL_TYPE
          ? Math.max(max, item.attemptNumber ?? 0)
          : max,
      0,
    )

    return maxAttemptNumber + 1
  }
}

export function buildOrderContextKey(orderId: string): string {
  return `ORDER#${orderId}`
}
