import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import {
  EMAIL_DELIVERY_STATUSES,
  EmailContextType,
  EmailDeliveryStatistics,
  EmailDeliveryStatus,
  EmailTracking,
  EmailTrackingView,
  EmailType,
} from './mail.types'

const RETRYABLE_ACCEPTED_AGE_MS = 30 * 60 * 1000

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
    return this.hasActiveTracking({
      contextType: 'ORDER',
      contextId: orderId,
      emailType: 'ORDER_CONFIRMATION',
    })
  }

  async hasActiveTracking(input: {
    contextType: EmailContextType
    contextId: string
    emailType: EmailType
  }): Promise<boolean> {
    const items = await this.findByContext(input.contextType, input.contextId, [input.emailType])
    return items.some((item) => item.emailType === input.emailType && item.status !== 'FAILED')
  }

  async createOrderConfirmationTrackingItems(input: {
    orderId: string
    recipientEmails: string[]
    status: EmailDeliveryStatus
    configurationSetName?: string
    failureReason?: string
    resendOfByRecipient?: Record<string, string>
  }): Promise<EmailTracking[]> {
    return this.createTrackingItems({
      emailType: 'ORDER_CONFIRMATION',
      contextType: 'ORDER',
      contextId: input.orderId,
      recipientEmails: input.recipientEmails,
      status: input.status,
      configurationSetName: input.configurationSetName,
      failureReason: input.failureReason,
      resendOfByRecipient: input.resendOfByRecipient,
    })
  }

  async createTrackingItems(input: {
    emailType: EmailType
    contextType: EmailContextType
    contextId: string
    recipientEmails: string[]
    status: EmailDeliveryStatus
    configurationSetName?: string
    failureReason?: string
    resendOfByRecipient?: Record<string, string>
  }): Promise<EmailTracking[]> {
    const createdAt = new Date().toISOString()
    const contextKey = buildContextKey(input.contextType, input.contextId)
    const attemptNumber = await this.resolveNextAttemptNumber(
      input.contextType,
      input.contextId,
      input.emailType,
    )
    const items = input.recipientEmails.map((recipientEmail) => ({
      emailId: randomUUID(),
      emailType: input.emailType,
      recipientEmail,
      status: input.status,
      contextType: input.contextType,
      contextId: input.contextId,
      contextKey,
      attemptNumber,
      resendOfEmailId: input.resendOfByRecipient?.[recipientEmail],
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

  async findByContext(
    contextType: EmailContextType,
    contextId: string,
    emailTypes?: EmailType[],
  ): Promise<EmailTrackingView[]> {
    const contextKey = buildContextKey(contextType, contextId)
    const types = emailTypes && emailTypes.length > 0 ? emailTypes : undefined

    const items = types
      ? (
          await Promise.all(
            types.map(async (emailType) => {
              const items = await this.queryAll({
                TableName: this.tableName,
                IndexName: 'GSI_ContextEmailType',
                KeyConditionExpression: '#contextKey = :contextKey AND #emailType = :emailType',
                ExpressionAttributeNames: {
                  '#contextKey': 'contextKey',
                  '#emailType': 'emailType',
                },
                ExpressionAttributeValues: {
                  ':contextKey': contextKey,
                  ':emailType': emailType,
                },
              })
              return items
            }),
          )
        ).flat()
      : await this.scanByContext(contextKey)

    return items
      .map((item) => this.withRetryableFlag(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async findLatestRetryableForRecipient(input: {
    contextType: EmailContextType
    contextId: string
    emailType: EmailType
    recipientEmail: string
  }): Promise<EmailTrackingView | undefined> {
    const normalizedRecipientEmail = input.recipientEmail.trim().toLowerCase()
    const latest = (
      await this.findByContext(input.contextType, input.contextId, [input.emailType])
    ).find((item) => item.recipientEmail === normalizedRecipientEmail)

    return latest?.isRetryable ? latest : undefined
  }

  async getLatestSummary(contextType: EmailContextType, contextId: string, emailType: EmailType) {
    const items = await this.findByContext(contextType, contextId, [emailType])
    const latest = items[0]
    if (!latest) {
      return undefined
    }

    return {
      recipientEmail: latest.recipientEmail,
      emailType: latest.emailType,
      status: latest.status,
      updatedAt: latest.updatedAt,
      emailId: latest.emailId,
      isRetryable: latest.isRetryable,
      attemptNumber: latest.attemptNumber,
    }
  }

  async getStatistics(emailTypes: EmailType[]): Promise<EmailDeliveryStatistics> {
    const result = createEmptyStatistics(emailTypes)

    await Promise.all(
      emailTypes.flatMap((emailType) =>
        EMAIL_DELIVERY_STATUSES.map(async (status) => {
          result[emailType][status] = await this.countAll({
            TableName: this.tableName,
            IndexName: 'GSI_EmailTypeStatus',
            KeyConditionExpression: '#emailType = :emailType AND #status = :status',
            ExpressionAttributeNames: {
              '#emailType': 'emailType',
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':emailType': emailType,
              ':status': status,
            },
            Select: 'COUNT',
          })
        }),
      ),
    )

    return result
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
        let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt, #sentAt = :sentAt'

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

  logTrackingSkipped(contextId: string, reason: string): void {
    this.logger.warn(`Skipped email tracking for ${contextId}: ${reason}.`)
  }

  private async resolveNextAttemptNumber(
    contextType: EmailContextType,
    contextId: string,
    emailType: EmailType,
  ): Promise<number> {
    const items = await this.findByContext(contextType, contextId, [emailType])
    const maxAttemptNumber = items.reduce((max, item) => Math.max(max, item.attemptNumber ?? 0), 0)

    return maxAttemptNumber + 1
  }

  private async scanByContext(contextKey: string): Promise<EmailTracking[]> {
    const items: EmailTracking[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined

    do {
      const response = await this.dynamoDbService.documentClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: '#contextKey = :contextKey',
          ExpressionAttributeNames: {
            '#contextKey': 'contextKey',
          },
          ExpressionAttributeValues: {
            ':contextKey': contextKey,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )
      items.push(...((response.Items ?? []) as EmailTracking[]))
      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined
    } while (exclusiveStartKey)

    return items
  }

  private async queryAll(input: QueryCommand['input']): Promise<EmailTracking[]> {
    const items: EmailTracking[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined

    do {
      const response = await this.dynamoDbService.documentClient.send(
        new QueryCommand({
          ...input,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )
      items.push(...((response.Items ?? []) as EmailTracking[]))
      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined
    } while (exclusiveStartKey)

    return items
  }

  private async countAll(input: QueryCommand['input']): Promise<number> {
    let total = 0
    let exclusiveStartKey: Record<string, unknown> | undefined

    do {
      const response = await this.dynamoDbService.documentClient.send(
        new QueryCommand({
          ...input,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )
      total += response.Count ?? 0
      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined
    } while (exclusiveStartKey)

    return total
  }

  private withRetryableFlag(item: EmailTracking): EmailTrackingView {
    return {
      ...item,
      isRetryable: isRetryableEmailTracking(item),
    }
  }
}

export function isRetryableEmailTracking(item: EmailTracking): boolean {
  if (item.status === 'FAILED' || item.status === 'REJECTED') {
    return true
  }

  if (item.status === 'BOUNCED') {
    return item.bounceType === 'Transient' || item.bounceType === 'Undetermined'
  }

  if (item.status === 'PENDING' || item.status === 'SENT') {
    const updatedAtMs = new Date(item.updatedAt).getTime()
    return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs >= RETRYABLE_ACCEPTED_AGE_MS
  }

  return false
}

export function buildContextKey(contextType: EmailContextType, contextId: string): string {
  return `${contextType}#${contextId}`
}

export function buildOrderContextKey(orderId: string): string {
  return buildContextKey('ORDER', orderId)
}

export function buildUserContextKey(userId: string): string {
  return buildContextKey('USER', userId)
}

function createEmptyStatistics(emailTypes: EmailType[]): EmailDeliveryStatistics {
  return Object.fromEntries(
    emailTypes.map((emailType) => [
      emailType,
      Object.fromEntries(EMAIL_DELIVERY_STATUSES.map((status) => [status, 0])),
    ]),
  ) as EmailDeliveryStatistics
}
