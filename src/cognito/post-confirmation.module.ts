import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DynamoDbModule } from '../dynamodb/dynamodb.module'
import { MailModule } from '../mail/mail.module'
import { validateRuntimeEnv } from '../config/env.validation'
import { PostConfirmationService } from './post-confirmation.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.RUNTIME_ENV_FILE ?? '.env.dev',
      validate: validateRuntimeEnv,
    }),
    DynamoDbModule,
    MailModule,
  ],
  providers: [PostConfirmationService],
  exports: [PostConfirmationService],
})
export class PostConfirmationModule {}
