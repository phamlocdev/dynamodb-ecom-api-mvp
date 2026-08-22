export const productsTableName = 'products'
export const categoriesTableName = 'categories'
export const cartsTableName = 'carts'
export const cartItemsTableName = 'cart-items'
export const ordersTableName = 'orders'
export const orderItemsTableName = 'order-items'
export const inventoryTableName = 'inventory'
export const placeOrderQueueName = 'place-order.fifo'
export const placeOrderDlqName = 'place-order-dlq.fifo'
export const releaseReservationQueueName = 'release-reservation.fifo'
export const releaseReservationDlqName = 'release-reservation-dlq.fifo'
export const ordersEntityType = 'ORDER'

export const defaultHostedUiCallbackUrl = 'http://localhost:3000/auth/callback'
export const defaultLogoutUrl = 'http://localhost:3000/auth/login'
export const defaultClientOrigin = 'http://localhost:3000'
export const localStackCognitoBaseUrl = 'http://localhost.localstack.cloud:4566'

export const enableLocalStackCognitoTriggers = true
export const enableLocalStackApiGatewayAuthorizer = true

export const defaultHostedUiDomainPrefix = 'dynamodb-mvp-local'
