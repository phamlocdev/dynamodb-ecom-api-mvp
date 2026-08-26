import { Module } from '@nestjs/common'
import { CartsModule } from '../carts/carts.module'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments.controller'
import { OrdersController } from './orders.controller'
import { OrdersQueueService } from './orders.queue'
import { OrdersService } from './orders.service'
import { VnpayService } from './vnpay.service'
import { VnpaySecretsService } from './vnpay-secrets.service'

@Module({
  imports: [CartsModule, UsersModule],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersQueueService, OrdersService, VnpaySecretsService, VnpayService],
  exports: [OrdersQueueService, OrdersService, VnpaySecretsService, VnpayService],
})
export class OrdersModule {}
