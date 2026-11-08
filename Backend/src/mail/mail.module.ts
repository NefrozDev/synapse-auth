import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Outgoing e-mail (password recovery). */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
