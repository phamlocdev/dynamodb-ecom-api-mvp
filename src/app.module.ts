import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { CartsModule } from './carts/carts.module'
import { CategoriesModule } from './categories/categories.module'
import { DynamoDbModule } from './dynamodb/dynamodb.module'
import { HealthModule } from './health/health.module'
import { InventoryModule } from './inventory/inventory.module'
import { OrdersModule } from './orders/orders.module'
import { PaymentsModule } from './payments/payments.module'
import { ProductsModule } from './products/products.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    CartsModule,
    DynamoDbModule,
    HealthModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ProductsModule,
    CategoriesModule,
    UsersModule,
  ],
})
export class AppModule {}
