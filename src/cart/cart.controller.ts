import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import {
  ApiCreatedResponse,
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
import { CartService } from './cart.service'
import { AddCartItemDto } from './dto/add-cart-item.dto'

/**
 * Helper: lấy userId (Cognito sub) từ JWT context.
 * API Gateway V2 inject event context vào request object qua serverless-express.
 * Sub là unique identifier cho mỗi Cognito user.
 */
function getUserIdFromRequest(req: Request): string {
  const event = (req as any).apiGateway?.event
  // JWT claims được inject bởi API Gateway authorizer
  const sub =
    event?.requestContext?.authorizer?.jwt?.claims?.sub ??
    event?.requestContext?.authorizer?.claims?.sub
  if (!sub) {
    throw new Error('Cannot resolve userId from request context')
  }
  return sub as string
}

@ApiTags('cart')
@Controller('carts')
export class CartController {
  constructor(@Inject(CartService) private readonly cartService: CartService) {}

  @Get('me')
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({ summary: 'Get current user cart items' })
  @ApiOkResponse({ description: 'List of cart items.' })
  getCart(@Req() req: Request) {
    const userId = getUserIdFromRequest(req)
    return this.cartService.getCart(userId)
  }

  @Post('items')
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiAuth()
  @ApiOperation({ summary: 'Add or update a cart item (upsert by productId)' })
  @ApiCreatedResponse({ description: 'Cart item added/updated.' })
  addItem(
    @Req() req: Request,
    @Body(new DtoValidationPipe(AddCartItemDto)) dto: AddCartItemDto,
  ) {
    const userId = getUserIdFromRequest(req)
    return this.cartService.addItem(userId, dto)
  }

  @Delete('items/:productId')
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({ summary: 'Remove an item from cart' })
  @ApiParam({ name: 'productId' })
  @ApiNoContentResponse({ description: 'Cart item removed.' })
  @ApiNotFoundResponse({ description: 'Cart item not found.' })
  async removeItem(@Req() req: Request, @Param('productId') productId: string) {
    const userId = getUserIdFromRequest(req)
    await this.cartService.removeItem(userId, productId)
  }
}
