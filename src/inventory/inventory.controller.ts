import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
} from '@nestjs/common'
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { Public } from '../auth/public.decorator'
import { Role } from '../auth/roles.enum'
import { Roles } from '../auth/roles.decorator'
import { ApiAuth } from '../auth/api-auth.decorator'
import { DtoValidationPipe } from '../validation/dto-validation.pipe'
import { InventoryService } from './inventory.service'
import { SetInventoryDto } from './dto/set-inventory.dto'

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventoryService: InventoryService) {}

  @Get(':productId')
  @Public()
  @ApiOperation({ summary: 'Get inventory (stock) for a product' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ description: 'Inventory record returned.' })
  @ApiNotFoundResponse({ description: 'Inventory record not found.' })
  getInventory(@Param('productId') productId: string) {
    return this.inventoryService.getInventory(productId)
  }

  @Put(':productId')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({ summary: 'Set (upsert) stock for a product — admin/manager only' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ description: 'Inventory record upserted.' })
  setInventory(
    @Param('productId') productId: string,
    @Body(new DtoValidationPipe(SetInventoryDto)) dto: SetInventoryDto,
  ) {
    return this.inventoryService.setStock(productId, dto.stock)
  }
}
