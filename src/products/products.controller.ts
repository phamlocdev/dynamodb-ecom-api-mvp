import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { CreateProductDto } from './dto/create-product.dto'
import { ListProductsQueryDto } from './dto/list-products-query.dto'
import { PaginatedProductResponseDto, ProductResponseDto } from './dto/product-response.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { ProductsService } from './products.service'
import { Product } from './product.types'
import { PaginatedResponse } from '../pagination/pagination.types'

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'The request body is invalid.' })
  @ApiConflictResponse({ description: 'Generated ID already exists.' })
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.productsService.create(dto)
  }

  @Get()
  @ApiOperation({
    summary: 'List products',
    description:
      'Uses DynamoDB Scan with cursor pagination and optional product filters. No GSI or order is guaranteed.',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Return only products that reference this categoryId.',
    example: 'electronics',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'INACTIVE'],
    description: 'Return only products with this status.',
  })
  @ApiQuery({
    name: 'minPrice',
    required: false,
    type: Number,
    description: 'Minimum product price in VND.',
  })
  @ApiQuery({
    name: 'maxPrice',
    required: false,
    type: Number,
    description: 'Maximum product price in VND.',
  })
  @ApiQuery({
    name: 'updatedFrom',
    required: false,
    description: 'Return products updated at or after this ISO timestamp.',
  })
  @ApiQuery({
    name: 'updatedTo',
    required: false,
    description: 'Return products updated at or before this ISO timestamp.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Case-sensitive substring search across product name and description.',
  })
  @ApiOkResponse({ type: PaginatedProductResponseDto })
  findAll(@Query() query: ListProductsQueryDto): Promise<PaginatedResponse<Product>> {
    return this.productsService.findAll(query)
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get one product by its primary key' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  findOne(@Param('productId') productId: string): Promise<Product> {
    return this.productsService.findOne(productId)
  }

  @Patch(':productId')
  @ApiOperation({ summary: 'Update one or more mutable product fields' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'No mutable fields or invalid input.' })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  update(@Param('productId') productId: string, @Body() dto: UpdateProductDto): Promise<Product> {
    return this.productsService.update(productId, dto)
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Product deleted.' })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  async remove(@Param('productId') productId: string): Promise<void> {
    await this.productsService.remove(productId)
  }
}
