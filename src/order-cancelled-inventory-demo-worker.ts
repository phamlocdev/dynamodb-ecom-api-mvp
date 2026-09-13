import type { EventBridgeEvent } from 'aws-lambda'

interface OrderCancelledEventDetail {
  orderId?: unknown
  cancelledAt?: unknown
}

export async function handler(
  event: EventBridgeEvent<'OrderCancelled', OrderCancelledEventDetail>,
): Promise<void> {
  console.log(
    JSON.stringify({
      worker: 'order-cancelled-inventory-demo-worker',
      message: 'Demo inventory target received OrderCancelled event.',
      eventId: event.id,
      detailType: event['detail-type'],
      source: event.source,
      detail: event.detail,
    }),
  )
}
