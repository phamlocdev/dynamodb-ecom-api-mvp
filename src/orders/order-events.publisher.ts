import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const ORDER_EVENT_SOURCE = 'ecommerce.orders'
const ORDER_SHIPPED_DETAIL_TYPE = 'OrderShipped'

export interface OrderShippedEventDetail {
  orderId: string
  shippedAt: string
}

@Injectable()
export class OrderEventsPublisher {
  private readonly logger = new Logger(OrderEventsPublisher.name)
  private readonly eventBridgeClient: EventBridgeClient
  private readonly busName: string

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const region =
      configService.get<string>('AWS_REGION') ??
      configService.get<string>('AWS_DEFAULT_REGION') ??
      'ap-southeast-1'

    this.eventBridgeClient = new EventBridgeClient({ region })
    this.busName = configService.get<string>('ORDER_EVENTS_BUS_NAME') ?? 'ecommerce-domain-events'
  }

  async publishOrderShipped(detail: OrderShippedEventDetail): Promise<void> {
    const response = await this.eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: ORDER_EVENT_SOURCE,
            DetailType: ORDER_SHIPPED_DETAIL_TYPE,
            Detail: JSON.stringify(detail),
          },
        ],
      }),
    )

    if (response.FailedEntryCount && response.FailedEntryCount > 0) {
      const failedEntry = response.Entries?.find((entry) => entry.ErrorCode || entry.ErrorMessage)
      this.logger.error(
        `Failed to publish ${ORDER_SHIPPED_DETAIL_TYPE} for order ${detail.orderId}: ${failedEntry?.ErrorCode ?? 'unknown-error'} ${failedEntry?.ErrorMessage ?? ''}`.trim(),
      )
      throw new Error(`Failed to publish ${ORDER_SHIPPED_DETAIL_TYPE} event.`)
    }
  }
}
