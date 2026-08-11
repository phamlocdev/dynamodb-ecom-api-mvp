import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { Product } from './product.types';

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
    return this.productsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List products',
    description: 'Uses DynamoDB Scan for this small learning dataset. No order or pagination is guaranteed.',
  })
  @ApiOkResponse({ type: ProductResponseDto, isArray: true })
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get one product by its primary key' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  findOne(@Param('productId') productId: string): Promise<Product> {
    return this.productsService.findOne(productId);
  }

  @Patch(':productId')
  @ApiOperation({ summary: 'Update one or more mutable product fields' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'No mutable fields or invalid input.' })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  update(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(productId, dto);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Product deleted.' })
  @ApiNotFoundResponse({ description: 'Product does not exist.' })
  async remove(@Param('productId') productId: string): Promise<void> {
    await this.productsService.remove(productId);
  }
}
