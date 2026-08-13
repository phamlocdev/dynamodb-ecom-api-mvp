import type { PaginationQueryDto } from '../pagination/pagination-query.dto'
import type { PaginatedResponse } from '../pagination/pagination.types'
import type { Category } from './category.types'
import type { CreateCategoryInput } from './inputs/create-category.input'
import type { UpdateCategoryInput } from './inputs/update-category.input'

export interface CategoryRepository {
  create(category: Category): Promise<void>
  findAll(query: PaginationQueryDto): Promise<PaginatedResponse<Category>>
  findOne(categoryId: string): Promise<Category | null>
  update(categoryId: string, dto: UpdateCategoryInput, updatedAt: string): Promise<Category | null>
  remove(categoryId: string): Promise<boolean>
}

export interface CategoryCoreDependencies {
  repository: CategoryRepository
  now?: () => string
  normalizeCategoryId?: (categoryId: string) => string
}

export type CategoryCreateInput = CreateCategoryInput
export type CategoryUpdateInput = UpdateCategoryInput
