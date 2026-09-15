import { Module } from '@nestjs/common'
import { EmailTrackingService } from './email-tracking.service'
import { SesMailService } from './ses-mail.service'

@Module({
  providers: [EmailTrackingService, SesMailService],
  exports: [EmailTrackingService, SesMailService],
})
export class MailModule {}
