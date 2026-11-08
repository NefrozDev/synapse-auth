import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { MailModule } from '../mail/mail.module';
import { OidcModule } from '../oidc/oidc.module';
import { PasswordResetController } from './password-reset.controller';
import { PasswordReset } from './password-reset.entity';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PasswordReset]),
    AccountsModule,
    MailModule,
    OidcModule,
  ],
  controllers: [PasswordResetController],
  providers: [PasswordResetService],
})
export class PasswordResetModule {}
