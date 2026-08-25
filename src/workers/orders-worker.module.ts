import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CartsModule } from '../carts/carts.module'
import { DynamoDbModule } from '../dynamodb/dynamodb.module'
import { InventoryModule } from '../inventory/inventory.module'
import { OrdersModule } from '../orders/orders.module'
import { ProductsModule } from '../products/products.module'
import { validateRuntimeEnv } from '../config/env.validation'
import { UsersModule } from '../users/users.module'
import { OrdersWorkerService } from './orders-worker.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateRuntimeEnv,
    }),
    DynamoDbModule,
    UsersModule,
    ProductsModule,
    CartsModule,
    InventoryModule,
    OrdersModule,
  ],
  providers: [OrdersWorkerService],
  exports: [OrdersWorkerService],
})
export class OrdersWorkerModule {}
