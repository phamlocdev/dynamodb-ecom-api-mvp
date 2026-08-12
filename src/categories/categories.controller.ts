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
import { Category } from './category.types';
import { CategoriesService } from './categories.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category with a stable categoryId slug' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ description: 'The request body is invalid.' })
  @ApiConflictResponse({ description: 'categoryId already exists.' })
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List categories' })
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Get(':categoryId')
  @ApiOperation({ summary: 'Get one category by categoryId' })
  @ApiParam({ name: 'categoryId', example: 'electronics' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category does not exist.' })
  findOne(@Param('categoryId') categoryId: string): Promise<Category> {
    return this.categoriesService.findOne(categoryId);
  }

  @Patch(':categoryId')
  @ApiOperation({ summary: 'Update category name or description' })
  @ApiParam({ name: 'categoryId', example: 'electronics' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ description: 'No mutable fields or invalid input.' })
  @ApiNotFoundResponse({ description: 'Category does not exist.' })
  update(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(categoryId, dto);
  }

  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category',
    description: 'This does not update Products that still reference this categoryId.',
  })
  @ApiParam({ name: 'categoryId', example: 'electronics' })
  @ApiNoContentResponse({ description: 'Category deleted.' })
  @ApiNotFoundResponse({ description: 'Category does not exist.' })
  async remove(@Param('categoryId') categoryId: string): Promise<void> {
    await this.categoriesService.remove(categoryId);
  }
}
