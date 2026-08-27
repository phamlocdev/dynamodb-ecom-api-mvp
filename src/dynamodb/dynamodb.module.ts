import { Global, Module } from '@nestjs/common'
import { CommerceTableService } from './commerce-table.service'
import { DynamoDbService } from './dynamodb.service'

@Global()
@Module({
  providers: [DynamoDbService, CommerceTableService],
  exports: [DynamoDbService, CommerceTableService],
})
export class DynamoDbModule {}
