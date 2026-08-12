import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DynamoDbService } from '../dynamodb/dynamodb.service'
import { PaginatedResponse } from '../pagination/pagination.types'
import { CreateProductDto } from './dto/create-product.dto'
import { ListProductsQueryDto } from './dto/list-products-query.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { CreateProductInput } from './inputs/create-product.input'
import { ListProductsQueryInput } from './inputs/list-products-query.input'
import { UpdateProductInput } from './inputs/update-product.input'
import { ProductsCore } from './products.core'
import { ProductsDynamoDbRepository } from './products-dynamodb.repository'
import { toNestProductException } from './products.errors'
import { Product } from './product.types'

@Injectable()
export class ProductsService {
  private readonly productsCore: ProductsCore

  constructor(dynamoDbService: DynamoDbService, configService: ConfigService) {
    const tableName = configService.get<string>('PRODUCTS_TABLE') ?? 'products'
    this.productsCore = new ProductsCore({
      repository: new ProductsDynamoDbRepository(dynamoDbService.documentClient, tableName),
    })
  }

  async create(dto: CreateProductDto): Promise<Product> {
    try {
      return await this.productsCore.create(dto as CreateProductInput)
    } catch (error) {
      throw toNestProductException(error)
    }
  }

  async findAll(query: ListProductsQueryDto): Promise<PaginatedResponse<Product>> {
    try {
      return await this.productsCore.findAll(query as ListProductsQueryInput)
    } catch (error) {
      throw toNestProductException(error)
    }
  }

  async findOne(productId: string): Promise<Product> {
    try {
      return await this.productsCore.findOne(productId)
    } catch (error) {
      throw toNestProductException(error)
    }
  }

  async update(productId: string, dto: UpdateProductDto): Promise<Product> {
    try {
      return await this.productsCore.update(productId, dto as UpdateProductInput)
    } catch (error) {
      throw toNestProductException(error)
    }
  }

  async remove(productId: string): Promise<void> {
    try {
      await this.productsCore.remove(productId)
    } catch (error) {
      throw toNestProductException(error)
    }
  }
}
