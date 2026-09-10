import { ConsoleLogger, INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { PostConfirmationModule } from './cognito/post-confirmation.module'
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

export async function createPostConfirmationApp(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(PostConfirmationModule, {
    logger: new ConsoleLogger('', {
      logLevels: ['log', 'error', 'warn'],
      colors: false,
    }),
  })
}
