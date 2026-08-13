import {
  Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { Category } from './category.types'
import { CategoriesCore } from './categories.core'
import { CategoriesDynamoDbRepository } from './categories-dynamodb.repository'
import { toNestCategoryException } from './categories.errors'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { CreateCategoryInput } from './inputs/create-category.input'
import { UpdateCategoryInput } from './inputs/update-category.input'
import { PaginationQueryDto } from '../pagination/pagination-query.dto'
import { PaginatedResponse } from '../pagination/pagination.types'

@Injectable()
export class CategoriesService {
  private readonly categoriesCore: CategoriesCore

  constructor(
    dynamoDbService: DynamoDbService,
    configService: ConfigService,
  ) {
    const tableName = configService.get<string>('CATEGORIES_TABLE') ?? 'categories'
    this.categoriesCore = new CategoriesCore({
      repository: new CategoriesDynamoDbRepository(dynamoDbService.documentClient, tableName),
    })
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    try {
      return await this.categoriesCore.create(dto as CreateCategoryInput)
    } catch (error) {
      throw toNestCategoryException(error)
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponse<Category>> {
    try {
      return await this.categoriesCore.findAll(query)
    } catch (error) {
      throw toNestCategoryException(error)
    }
  }

  async findOne(categoryId: string): Promise<Category> {
    try {
      return await this.categoriesCore.findOne(categoryId)
    } catch (error) {
      throw toNestCategoryException(error)
    }
  }

  async update(categoryId: string, dto: UpdateCategoryDto): Promise<Category> {
    try {
      return await this.categoriesCore.update(categoryId, dto as UpdateCategoryInput)
    } catch (error) {
      throw toNestCategoryException(error)
    }
  }

  async remove(categoryId: string): Promise<void> {
    try {
      await this.categoriesCore.remove(categoryId)
    } catch (error) {
      throw toNestCategoryException(error)
    }
  }
}
