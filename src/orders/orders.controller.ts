import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { type Request } from 'express'
import { CurrentUser } from '../auth/current-user.decorator'
import { AuthenticatedUser } from '../auth/auth.types'
import { PaginatedResponse } from '../pagination/pagination.types'
import { DtoValidationPipe } from '../validation/dto-validation.pipe'
import { CreateOrderDto } from './dto/create-order.dto'
import { ListOrdersQueryDto } from './dto/list-orders-query.dto'
import {
  OrderDetailsResponseDto,
  OrderResponseDto,
  PaginatedOrderResponseDto,
  PlaceOrderResponseDto,
  TriggerPaymentResponseDto,
} from './dto/order-response.dto'
import { OrdersService } from './orders.service'
import { Order, OrderDetails } from './orders.types'

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create an async order request from a cart' })
  @ApiAcceptedResponse({ type: PlaceOrderResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new DtoValidationPipe(CreateOrderDto)) dto: CreateOrderDto,
  ): Promise<PlaceOrderResponseDto> {
    const order = await this.ordersService.createOrderRequest(user, dto)
    return {
      orderId: order.orderId,
      status: order.status,
    }
  }

  @Get()
  @ApiOperation({ summary: 'List orders for the current user or for staff filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'customerEmail', required: false })
  @ApiOkResponse({ type: PaginatedOrderResponseDto })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new DtoValidationPipe(ListOrdersQueryDto)) query: ListOrdersQueryDto,
  ): Promise<PaginatedResponse<Order>> {
    return this.ordersService.findAll(user, query)
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get one order' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiOkResponse({ type: OrderDetailsResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ): Promise<OrderDetails> {
    return this.ordersService.findOne(user, orderId)
  }

  @Post(':orderId/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a VNPay payment URL for a reserved order' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiOkResponse({ type: TriggerPaymentResponseDto })
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Req() request: Request,
  ): Promise<TriggerPaymentResponseDto> {
    return this.ordersService.triggerPayment(user, orderId, resolveClientIp(request))
  }
}

function resolveClientIp(request: Request): string {
  const forwardedFor = request.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() ?? '127.0.0.1'
  }

  const apiGatewaySourceIp = (
    request as Request & {
      apiGateway?: { event?: { requestContext?: { http?: { sourceIp?: string } } } }
    }
  ).apiGateway?.event?.requestContext?.http?.sourceIp
  if (apiGatewaySourceIp) {
    return apiGatewaySourceIp
  }

  return request.ip || '127.0.0.1'
}
