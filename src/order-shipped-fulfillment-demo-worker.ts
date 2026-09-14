import type { EventBridgeEvent } from 'aws-lambda'
import { runIdempotentEventConsumer } from './event-consumers/event-consumer-idempotency'

interface OrderShippedEventDetail {
  orderId?: unknown
  shippedAt?: unknown
}

export async function handler(
  event: EventBridgeEvent<'OrderShipped', OrderShippedEventDetail>,
): Promise<void> {
  const worker = 'order-shipped-fulfillment-demo-worker'
  const orderId = event.detail?.orderId
  if (!isNonEmptyString(orderId)) {
    console.warn(
      JSON.stringify({
        worker,
        message: 'Skipped invalid OrderShipped fulfillment event detail.',
        eventId: event.id,
        detail: event.detail,
      }),
    )
    return
  }

  const idempotencyKey = `ORDER#${orderId}#FULFILLMENT_ORDER_SHIPPED`
  await runIdempotentEventConsumer(
    {
      idempotencyKey,
      consumerName: worker,
      eventId: event.id,
      eventSource: event.source,
      eventDetailType: event['detail-type'],
      contextType: 'ORDER',
      contextId: orderId,
    },
    async () => {
      assertDemoWorkerNotForcedToFail(worker)
      console.log(
        JSON.stringify({
          worker,
          message: 'Demo fulfillment target received OrderShipped event.',
          idempotencyKey,
          eventId: event.id,
          detailType: event['detail-type'],
          source: event.source,
          detail: event.detail,
        }),
      )
    },
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function assertDemoWorkerNotForcedToFail(worker: string): void {
  const forcedWorker = process.env.FORCE_EVENT_CONSUMER_FAILURE
  if (forcedWorker === 'true' || forcedWorker === worker) {
    const error = new Error(`Forced timeout failure for ${worker}.`)
    error.name = 'TimeoutError'
    throw error
  }
}
