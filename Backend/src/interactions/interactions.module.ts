import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { OidcModule } from '../oidc/oidc.module';
import { InteractionsController } from './interactions.controller';

@Module({
  imports: [AccountsModule, OidcModule],
  controllers: [InteractionsController],
})
export class InteractionsModule {}
