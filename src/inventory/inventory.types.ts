export interface InventoryRecord {
  productId: string
  availableQuantity: number
  reservedQuantity: number
  updatedAt: string
}

export interface ReservedInventoryItem {
  productId: string
  quantity: number
}
