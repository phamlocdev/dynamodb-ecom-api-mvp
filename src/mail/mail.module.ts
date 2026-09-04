import { Module } from '@nestjs/common'
import { SesMailService } from './ses-mail.service'

@Module({
  providers: [SesMailService],
  exports: [SesMailService],
})
export class MailModule {}
