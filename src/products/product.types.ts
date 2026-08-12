import { ProductStatus } from './product-status.enum'

export interface Product {
  productId: string
  name: string
  description: string
  categoryId: string
  price: number
  currency: 'VND'
  imageUrl?: string
  status: ProductStatus
  createdAt: string
  updatedAt: string
}
