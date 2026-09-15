import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { UploadModule } from '../upload/upload.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [MailModule, UploadModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
