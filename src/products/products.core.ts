import { randomUUID } from 'crypto'
import { AppError } from '../common/errors/app-error'
import { PaginatedResponse } from '../pagination/pagination.types'
import { ProductStatus } from './product-status.enum'
import { Product } from './product.types'
import { CreateProductInput } from './inputs/create-product.input'
import { ListProductsQueryInput } from './inputs/list-products-query.input'
import { UpdateProductInput } from './inputs/update-product.input'
import { ProductCoreDependencies } from './products.repository'

export class ProductsCore {
  private readonly repository
  private readonly createProductId
  private readonly now

  constructor(dependencies: ProductCoreDependencies) {
    this.repository = dependencies.repository
    this.createProductId = dependencies.createProductId ?? randomUUID
    this.now = dependencies.now ?? (() => new Date().toISOString())
  }

  async create(dto: CreateProductInput): Promise<Product> {
    const timestamp = this.now()
    const product: Product = {
      productId: this.createProductId(),
      name: dto.name,
      description: dto.description,
      categoryId: dto.categoryId,
      price: dto.price,
      currency: 'VND',
      imageUrl: dto.imageUrl,
      status: dto.status ?? ProductStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      await this.repository.create(product)
      return product
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new AppError('CONFLICT', 'A product with this ID already exists.')
      }
      throw error
    }
  }

  findAll(query: ListProductsQueryInput): Promise<PaginatedResponse<Product>> {
    return this.repository.findAll(query)
  }

  async findOne(productId: string): Promise<Product> {
    const product = await this.repository.findOne(productId)
    if (!product) {
      throw new AppError('NOT_FOUND', `Product ${productId} was not found.`)
    }
    return product
  }

  async update(productId: string, dto: UpdateProductInput): Promise<Product> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new AppError('VALIDATION_ERROR', 'Provide at least one product field to update.')
    }

    try {
      const updatedProduct = await this.repository.update(productId, dto, this.now())
      if (!updatedProduct) {
        throw new AppError('NOT_FOUND', `Product ${productId} was not found.`)
      }
      return updatedProduct
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new AppError('NOT_FOUND', `Product ${productId} was not found.`)
      }
      throw error
    }
  }

  async remove(productId: string): Promise<void> {
    try {
      const removed = await this.repository.remove(productId)
      if (!removed) {
        throw new AppError('NOT_FOUND', `Product ${productId} was not found.`)
      }
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new AppError('NOT_FOUND', `Product ${productId} was not found.`)
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
