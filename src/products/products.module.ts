import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { ProductEventsPublisher } from './product-events.publisher'
import { UploadModule } from '../upload/upload.module'

@Module({
  imports: [UploadModule],
  controllers: [ProductsController],
  providers: [ProductEventsPublisher, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
