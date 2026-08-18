import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { Request } from 'express'
import { Role } from '../auth/roles.enum'
import { Roles } from '../auth/roles.decorator'
import { ApiAuth } from '../auth/api-auth.decorator'
import { DtoValidationPipe } from '../validation/dto-validation.pipe'
import { OrdersService } from './orders.service'
import { UpdateOrderStatusDto } from './dto/update-order-status.dto'

function getUserIdFromRequest(req: Request): string {
  const event = (req as any).apiGateway?.event
  const sub =
    event?.requestContext?.authorizer?.jwt?.claims?.sub ??
    event?.requestContext?.authorizer?.claims?.sub
  if (!sub) {
    throw new Error('Cannot resolve userId from request context')
  }
  return sub as string
}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  /**
   * POST /orders — Place order từ cart hiện tại của user.
   *
   * Trả về 202 Accepted (không phải 201 Created) vì:
   * → Order sẽ được xử lý ASYNC bởi Order Processor Lambda qua SQS.
   * → Status ban đầu là PENDING, không phải CONFIRMED.
   * → Client nên poll GET /orders/:orderId để biết khi nào CONFIRMED.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Place an order from current cart',
    description:
      'Enqueues order into SQS for async processing. Returns 202 Accepted with PENDING status. ' +
      'Poll GET /orders/:orderId to check when order becomes CONFIRMED.',
  })
  @ApiAcceptedResponse({ description: 'Order enqueued. Status: PENDING.' })
  @ApiBadRequestResponse({ description: 'Cart is empty.' })
  placeOrder(@Req() req: Request) {
    const userId = getUserIdFromRequest(req)
    return this.ordersService.placeOrder(userId)
  }

  @Get()
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({ summary: "List current user's orders" })
  @ApiOkResponse({ description: 'List of orders.' })
  findMyOrders(@Req() req: Request) {
    const userId = getUserIdFromRequest(req)
    return this.ordersService.findByUser(userId)
  }

  @Get(':orderId')
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({ summary: 'Get one order by ID' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiOkResponse({ description: 'Order details.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  findOne(@Param('orderId') orderId: string) {
    return this.ordersService.findOne(orderId)
  }

  /**
   * DELETE /orders/:orderId — Cancel a PENDING order.
   *
   * Chỉ hoạt động khi status = PENDING.
   * Stock sẽ được hoàn lại.
   * Order Processor Lambda sẽ skip nếu thấy status = CANCELLED.
   */
  @Delete(':orderId')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Cancel a PENDING order',
    description:
      'Application-level cancel: updates status to CANCELLED and releases stock reservation. ' +
      'Order Processor Lambda will skip processing if it picks up this order.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiOkResponse({ description: 'Order cancelled.' })
  @ApiBadRequestResponse({ description: 'Order is not in PENDING status.' })
  @ApiForbiddenResponse({ description: 'You can only cancel your own orders.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  cancelOrder(@Req() req: Request, @Param('orderId') orderId: string) {
    const userId = getUserIdFromRequest(req)
    return this.ordersService.cancelOrder(userId, orderId)
  }

  @Patch(':orderId/status')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({ summary: 'Manually update order status (manager/admin only)' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiOkResponse({ description: 'Order status updated.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  updateStatus(
    @Param('orderId') orderId: string,
    @Body(new DtoValidationPipe(UpdateOrderStatusDto)) dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(orderId, dto)
  }
}
