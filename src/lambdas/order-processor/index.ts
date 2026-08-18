import { NestFactory } from '@nestjs/core'
import { INestApplicationContext } from '@nestjs/common'
import { SQSEvent, SQSRecord } from 'aws-lambda'
import { OrderProcessorAppModule } from './order-processor-app.module'
import { OrdersService } from '../../orders/orders.service'
import { OrderQueuePayload } from '../../orders/order.types'

// ─── NestJS Standalone Application Cache ─────────────────────────────────────
//
// Lambda Execution Context reuse (warm start):
// Khi Lambda container được tái sử dụng giữa các invocations (warm start),
// biến module-scope được giữ nguyên → không cần bootstrap lại NestJS mỗi lần.
//
// Pattern này tương tự cách lambda.ts (API Lambda) cache serverless-express handler:
//   let cachedHandler: PromiseHandler
//   cachedHandler ??= await bootstrap()
//
// NestJS Standalone Application (createApplicationContext):
// → Khởi động NestJS DI container nhưng KHÔNG start HTTP server.
// → Đủ để inject services và gọi business logic.
// → Phù hợp cho Lambda, CLI tools, background jobs.
let cachedApp: INestApplicationContext | undefined

async function getApp(): Promise<INestApplicationContext> {
  if (!cachedApp) {
    cachedApp = await NestFactory.createApplicationContext(OrderProcessorAppModule, {
      // Chỉ log error và warn trong Lambda để tránh log spam
      logger: ['error', 'warn', 'log'],
    })
  }
  return cachedApp
}

// ─── Lambda Handler ───────────────────────────────────────────────────────────
//
// SQS Event Source Mapping tự động invoke handler này khi có message trong queue.
// batchSize = 1 (đặt trong SqsConstruct) → event.Records luôn có đúng 1 record.
//
// Khác với polling thủ công:
// → Không cần ReceiveMessage, DeleteMessage thủ công.
// → SQS tự DELETE message nếu handler return thành công.
// → SQS sẽ RETRY (re-deliver) nếu handler throw error.
// → Sau maxReceiveCount lần retry → message vào DLQ.
export const handler = async (event: SQSEvent): Promise<void> => {
  // Bootstrap NestJS (hoặc dùng cached context nếu warm start)
  const app = await getApp()

  // Lấy OrdersService từ NestJS DI container
  // → Toàn bộ dependencies (DynamoDbService, InventoryService, v.v.) đã được inject
  const ordersService = app.get(OrdersService)

  console.log(`[OrderProcessor] Received ${event.Records.length} record(s)`)

  // Loop qua từng record (với batchSize=1 luôn là 1 record)
  for (const record of event.Records) {
    await processRecord(ordersService, record)
  }
}

// ─── Per-Record Processing ────────────────────────────────────────────────────
async function processRecord(ordersService: OrdersService, record: SQSRecord): Promise<void> {
  // Parse MessageBody → OrderQueuePayload
  // Đây là JSON được serialize bởi OrdersService.placeOrder() khi enqueue
  let payload: OrderQueuePayload
  try {
    payload = JSON.parse(record.body) as OrderQueuePayload
  } catch {
    // JSON parse error → message malformed → throw để Lambda fail → message vào DLQ
    // Không retry vì malformed message sẽ không bao giờ parse được
    console.error('[OrderProcessor] Malformed message body, sending to DLQ:', record.body)
    throw new Error(`Malformed SQS message body: ${record.messageId}`)
  }

  // Delegate toàn bộ business logic sang OrdersService.processOrder()
  // → Tái sử dụng NestJS service layer, không duplicate code
  // → Error sẽ bubble up → Lambda fail → SQS retry
  await ordersService.processOrder(payload)
}
