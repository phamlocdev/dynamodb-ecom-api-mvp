import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { CartModule } from './cart/cart.module'
import { CategoriesModule } from './categories/categories.module'
import { DynamoDbModule } from './dynamodb/dynamodb.module'
import { HealthModule } from './health/health.module'
import { InventoryModule } from './inventory/inventory.module'
import { OrdersModule } from './orders/orders.module'
import { ProductsModule } from './products/products.module'
import { SqsModule } from './sqs/sqs.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Infrastructure
    AuthModule,
    DynamoDbModule,
    SqsModule,
    // Feature modules
    HealthModule,
    ProductsModule,
    CategoriesModule,
    UsersModule,
    InventoryModule,
    CartModule,
    OrdersModule,
  ],
})
export class AppModule {}

