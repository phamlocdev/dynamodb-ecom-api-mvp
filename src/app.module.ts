import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CategoriesModule } from './categories/categories.module'
import { DynamoDbModule } from './dynamodb/dynamodb.module'
import { HealthModule } from './health/health.module'
import { ProductsModule } from './products/products.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDbModule,
    HealthModule,
    ProductsModule,
    CategoriesModule,
  ],
})
export class AppModule {}
