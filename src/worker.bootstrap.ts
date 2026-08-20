import { INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { OrdersWorkerModule } from './workers/orders-worker.module'

export async function createOrdersWorkerApp(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(OrdersWorkerModule, {
    logger: ['log', 'error', 'warn'],
  })
}
