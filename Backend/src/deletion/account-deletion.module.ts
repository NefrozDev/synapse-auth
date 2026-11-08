import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OidcModule } from '../oidc/oidc.module';
import { AccountDeletionNotice } from './account-deletion-notice.entity';
import { AccountDeletionService } from './account-deletion.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccountDeletionNotice]), OidcModule],
  providers: [AccountDeletionService],
  exports: [AccountDeletionService],
})
export class AccountDeletionModule {}
