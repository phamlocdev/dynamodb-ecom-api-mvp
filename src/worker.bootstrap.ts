import { ConsoleLogger, INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SesEventProcessorModule } from './mail/ses-event-processor.module'
import { OrdersWorkerModule } from './workers/orders-worker.module'

export async function createOrdersWorkerApp(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(OrdersWorkerModule, {
    logger: new ConsoleLogger('', {
      logLevels: ['log', 'error', 'warn'],
      colors: false,
    }),
  })
}

export async function createSesEventProcessorApp(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(SesEventProcessorModule, {
    logger: new ConsoleLogger('', {
      logLevels: ['log', 'error', 'warn'],
      colors: false,
    }),
  })
}
