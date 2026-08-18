import { Module } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { OrdersController } from './orders.controller'
import { InventoryModule } from '../inventory/inventory.module'
import { CartModule } from '../cart/cart.module'
import { ProductsModule } from '../products/products.module'

@Module({
  imports: [
    InventoryModule, // để inject InventoryService
    CartModule,      // để inject CartService
    ProductsModule,  // để inject ProductsService (validate product exists)
  ],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
