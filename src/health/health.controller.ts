import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/public.decorator'
import { DynamoDbService } from '../dynamodb/dynamodb.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DynamoDbService) private readonly dynamoDbService: DynamoDbService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Check NestJS and LocalStack DynamoDB connectivity' })
  @ApiResponse({ status: 200, description: 'DynamoDB is reachable.' })
  @ApiResponse({ status: 503, description: 'DynamoDB is unreachable.' })
  async getHealth(): Promise<{ status: 'ok'; dynamodb: 'ok' }> {
    try {
      await this.dynamoDbService.checkConnection()
      return { status: 'ok', dynamodb: 'ok' }
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        dynamodb: 'unavailable',
      })
    }
  }
}
