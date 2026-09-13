import type { EventBridgeEvent } from 'aws-lambda'

interface OrderShippedEventDetail {
  orderId?: unknown
  shippedAt?: unknown
}

export async function handler(
  event: EventBridgeEvent<'OrderShipped', OrderShippedEventDetail>,
): Promise<void> {
  console.log(
    JSON.stringify({
      worker: 'order-shipped-fulfillment-demo-worker',
      message: 'Demo fulfillment target received OrderShipped event.',
      eventId: event.id,
      detailType: event['detail-type'],
      source: event.source,
      detail: event.detail,
    }),
  )
}
