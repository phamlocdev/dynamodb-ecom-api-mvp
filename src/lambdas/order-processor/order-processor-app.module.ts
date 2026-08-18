import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DynamoDbModule } from '../../dynamodb/dynamodb.module'
import { SqsModule } from '../../sqs/sqs.module'
import { OrdersModule } from '../../orders/orders.module'

/**
 * OrderProcessorAppModule — minimal NestJS module dành riêng cho Order Processor Lambda.
 *
 * Tại sao cần module riêng thay vì dùng AppModule?
 * → AppModule có đầy đủ tất cả modules (Auth, Users, Health, Swagger, v.v.)
 *   nhưng Order Processor Lambda chỉ cần OrdersService và các dependencies của nó.
 * → Minimal module = cold start nhanh hơn (ít providers cần khởi tạo hơn).
 * → Không cần HTTP server (NestJS Standalone Application).
 *
 * Dependency tree:
 *   ConfigModule (global) → cung cấp ConfigService cho tất cả
 *   DynamoDbModule (global) → cung cấp DynamoDbService cho tất cả
 *   SqsModule (global) → cung cấp SqsService (OrdersService inject trong constructor)
 *   OrdersModule → import InventoryModule, CartModule, ProductsModule nội bộ
 *                  → cung cấp OrdersService với processOrder() method
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDbModule,
    SqsModule,
    OrdersModule,
  ],
})
export class OrderProcessorAppModule {}
