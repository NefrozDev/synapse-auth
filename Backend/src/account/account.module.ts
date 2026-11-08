import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountDeletionModule } from '../deletion/account-deletion.module';
import { OidcModule } from '../oidc/oidc.module';
import { AccountController } from './account.controller';
import { AccountSessionGuard } from './account-session.guard';

@Module({
  imports: [AccountsModule, OidcModule, AccountDeletionModule],
  controllers: [AccountController],
  providers: [AccountSessionGuard],
})
export class AccountModule {}
