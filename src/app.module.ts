import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DynamoDbModule } from './dynamodb/dynamodb.module';
import { HealthModule } from './health/health.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDbModule,
    HealthModule,
    ProductsModule,
  ],
})
export class AppModule {}
