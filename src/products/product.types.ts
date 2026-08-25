import { ProductStatus } from './product-status.enum'

export interface ProductImage {
  key: string
  sortOrder: number
  isPrimary: boolean
  altText?: string
  readUrl?: string
  readUrlExpiresInSeconds?: number
}

export interface Product {
  productId: string
  name: string
  description: string
  categoryId: string
  price: number
  currency: 'VND'
  imageUrl?: string
  images?: ProductImage[]
  status: ProductStatus
  createdAt: string
  updatedAt: string
}
