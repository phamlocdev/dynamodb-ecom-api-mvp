import { PaginatedResponse } from '../pagination/pagination.types'
import { Product } from './product.types'
import { CreateProductInput } from './inputs/create-product.input'
import { ListProductsQueryInput } from './inputs/list-products-query.input'
import { UpdateProductInput } from './inputs/update-product.input'

export interface ProductRepository {
  create(product: Product): Promise<void>
  findAll(query: ListProductsQueryInput): Promise<PaginatedResponse<Product>>
  findOne(productId: string): Promise<Product | null>
  update(productId: string, dto: UpdateProductInput, updatedAt: string): Promise<Product | null>
  remove(productId: string): Promise<boolean>
}

export interface ProductCoreDependencies {
  repository: ProductRepository
  createProductId?: () => string
  now?: () => string
}
