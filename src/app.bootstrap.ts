import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

const { eventContext } = require('@codegenie/serverless-express/src/middleware') as {
  eventContext: (options?: { reqPropKey?: string; deleteHeaders?: boolean }) => (
    req: unknown,
    res: unknown,
    next: () => void,
  ) => void
}

export interface BootstrapOptions {
  enableSwagger?: boolean
}

export async function createNestApp(
  options: BootstrapOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )

  app.use(eventContext({ reqPropKey: 'apiGateway' }))

  if (options.enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DynamoDB E-commerce Learning API')
      .setDescription('REST API for learning DynamoDB with LocalStack')
      .setVersion('1.0')
      // Thêm Bearer token auth vào Swagger UI
      // → Hiện nút "Authorize 🔒" ở góc phải Swagger UI
      // → Paste access_token (từ POST /auth/token) vào đây
      // → Tất cả requests sẽ tự động đính kèm header: Authorization: Bearer <token>
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the access_token obtained from POST /auth/token',
        },
        'cognito-jwt', // security scheme name — dùng trong @ApiBearerAuth('cognito-jwt')
      )
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api', app, document)
  }

  return app
}
