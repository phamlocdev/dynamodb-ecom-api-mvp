import { Module } from '@nestjs/common'
import { CartsModule } from '../carts/carts.module'
import { InventoryModule } from '../inventory/inventory.module'
import { ProductsModule } from '../products/products.module'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments.controller'
import { OrdersController } from './orders.controller'
import { OrdersQueueService } from './orders.queue'
import { OrdersService } from './orders.service'
import { VnpayService } from './vnpay.service'

@Module({
  imports: [CartsModule, InventoryModule, ProductsModule, UsersModule],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersQueueService, OrdersService, VnpayService],
  exports: [OrdersQueueService, OrdersService, VnpayService],
})
export class OrdersModule {}
