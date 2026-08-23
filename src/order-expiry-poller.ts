import { ScheduledEvent } from 'aws-lambda'
import { OrdersWorkerService } from './workers/orders-worker.service'
import { createOrdersWorkerApp } from './worker.bootstrap'

let workerServicePromise: Promise<OrdersWorkerService>

async function getWorkerService(): Promise<OrdersWorkerService> {
  if (!workerServicePromise) {
    workerServicePromise = createOrdersWorkerApp().then((app) => app.get(OrdersWorkerService))
  }

  return workerServicePromise
}

export async function handler(_event: ScheduledEvent): Promise<void> {
  const worker = await getWorkerService()
  await worker.handleReservationExpirySweep()
}
