import { Global, Module } from '@nestjs/common'
import { SqsService } from './sqs.service'

/**
 * SqsModule — Global module, tương tự DynamoDbModule.
 *
 * @Global() → SqsService được inject vào bất kỳ module nào mà không cần import lại.
 * OrdersService sẽ dùng SqsService để SendMessage vào queue.
 */
@Global()
@Module({
  providers: [SqsService],
  exports: [SqsService],
})
export class SqsModule {}
