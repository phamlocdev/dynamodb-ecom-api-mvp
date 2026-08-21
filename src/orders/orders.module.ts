import { Module } from '@nestjs/common'
import { CartsModule } from '../carts/carts.module'
import { PaymentsModule } from '../payments/payments.module'
import { UsersModule } from '../users/users.module'
import { OrdersController } from './orders.controller'
import { OrdersQueueService } from './orders.queue'
import { OrdersService } from './orders.service'

@Module({
  imports: [CartsModule, PaymentsModule, UsersModule],
  controllers: [OrdersController],
  providers: [OrdersQueueService, OrdersService],
  exports: [OrdersQueueService, OrdersService],
})
export class OrdersModule {}
