import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { CategoriesModule } from './categories/categories.module'
import { DynamoDbModule } from './dynamodb/dynamodb.module'
import { HealthModule } from './health/health.module'
import { ProductsModule } from './products/products.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    DynamoDbModule,
    HealthModule,
    ProductsModule,
    CategoriesModule,
    UsersModule,
  ],
})
export class AppModule {}
