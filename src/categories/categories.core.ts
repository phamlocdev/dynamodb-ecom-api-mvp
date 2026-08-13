import { AppError } from '../common/errors/app-error'
import type { PaginationQueryDto } from '../pagination/pagination-query.dto'
import type { PaginatedResponse } from '../pagination/pagination.types'
import type { Category } from './category.types'
import {
  type CategoryCoreDependencies,
  type CategoryCreateInput,
  type CategoryUpdateInput,
} from './categories.repository'

export class CategoriesCore {
  private readonly repository
  private readonly now
  private readonly normalizeCategoryId

  constructor(dependencies: CategoryCoreDependencies) {
    this.repository = dependencies.repository
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.normalizeCategoryId = dependencies.normalizeCategoryId ?? ((categoryId) => categoryId)
  }

  async create(dto: CategoryCreateInput): Promise<Category> {
    const timestamp = this.now()
    const category: Category = {
      categoryId: this.normalizeCategoryId(dto.categoryId),
      name: dto.name,
      description: dto.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      await this.repository.create(category)
      return category
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new AppError('CONFLICT', `Category ${category.categoryId} already exists.`)
      }

      throw error
    }
  }

  findAll(query: PaginationQueryDto): Promise<PaginatedResponse<Category>> {
    return this.repository.findAll(query)
  }

  async findOne(categoryId: string): Promise<Category> {
    const category = await this.repository.findOne(categoryId)

    if (!category) {
      throw new AppError('NOT_FOUND', `Category ${categoryId} was not found.`)
    }

    return category
  }

  async update(categoryId: string, dto: CategoryUpdateInput): Promise<Category> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new AppError('VALIDATION_ERROR', 'Provide at least one category field to update.')
    }

    try {
      const updatedCategory = await this.repository.update(categoryId, dto, this.now())

      if (!updatedCategory) {
        throw new AppError('NOT_FOUND', `Category ${categoryId} was not found.`)
      }

      return updatedCategory
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new AppError('NOT_FOUND', `Category ${categoryId} was not found.`)
      }

      throw error
    }
  }

  async remove(categoryId: string): Promise<void> {
    try {
      const removed = await this.repository.remove(categoryId)

      if (!removed) {
        throw new AppError('NOT_FOUND', `Category ${categoryId} was not found.`)
      }
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new AppError('NOT_FOUND', `Category ${categoryId} was not found.`)
      }

      throw error
    }
  }
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConditionalCheckFailedException'
  )
}
