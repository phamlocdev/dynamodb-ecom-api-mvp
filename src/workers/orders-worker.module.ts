import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CartsModule } from '../carts/carts.module'
import { DynamoDbModule } from '../dynamodb/dynamodb.module'
import { InventoryModule } from '../inventory/inventory.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'
import { ProductsModule } from '../products/products.module'
import { UsersModule } from '../users/users.module'
import { OrdersWorkerService } from './orders-worker.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDbModule,
    UsersModule,
    ProductsModule,
    CartsModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
  ],
  providers: [OrdersWorkerService],
  exports: [OrdersWorkerService],
})
export class OrdersWorkerModule {}
