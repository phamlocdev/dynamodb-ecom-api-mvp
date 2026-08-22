import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { PlaceOrderMessage, ReleaseReservationMessage } from './orders.types'

@Injectable()
export class OrdersQueueService {
  private readonly sqsClient: SQSClient
  private readonly placeOrderQueueUrl: string
  private readonly releaseReservationQueueUrl: string

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'
    const endpoint = configService.get<string>('DYNAMODB_ENDPOINT')
    const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID') ?? 'test'
    const secretAccessKey = configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? 'test'

    this.placeOrderQueueUrl = configService.get<string>('PLACE_ORDER_QUEUE_URL') ?? ''
    this.releaseReservationQueueUrl =
      configService.get<string>('RELEASE_RESERVATION_QUEUE_URL') ?? ''

    this.sqsClient = new SQSClient({
      region,
      ...(endpoint ? { endpoint } : {}),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  }

  async enqueuePlaceOrder(message: PlaceOrderMessage): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.placeOrderQueueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: message.customerId,
        MessageDeduplicationId: message.deduplicationKey,
      }),
    )
  }

  async enqueueReleaseReservation(message: ReleaseReservationMessage): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.releaseReservationQueueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: message.customerId,
        MessageDeduplicationId: `${message.orderId}:${message.targetStatus}`,
      }),
    )
  }
}
