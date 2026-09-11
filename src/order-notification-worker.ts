import { EventBridgeEvent } from 'aws-lambda'
import { OrderNotificationWorkerService } from './notifications/order-notification-worker.service'
import { createOrderNotificationWorkerApp } from './worker.bootstrap'

interface OrderShippedEventDetail {
  orderId?: unknown
  shippedAt?: unknown
}

let workerServicePromise: Promise<OrderNotificationWorkerService>

async function getWorkerService(): Promise<OrderNotificationWorkerService> {
  if (!workerServicePromise) {
    workerServicePromise = createOrderNotificationWorkerApp().then((app) =>
      app.get(OrderNotificationWorkerService),
    )
  }

  return workerServicePromise
}

export async function handler(
  event: EventBridgeEvent<'OrderShipped', OrderShippedEventDetail>,
): Promise<void> {
  const worker = await getWorkerService()
  await worker.handleOrderShippedEvent(event.detail ?? {})
}
