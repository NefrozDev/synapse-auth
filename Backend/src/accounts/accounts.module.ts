import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './account.entity';
import { AccountsService } from './accounts.service';
import { PasswordService } from './password.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  providers: [AccountsService, PasswordService],
  exports: [AccountsService, PasswordService],
})
export class AccountsModule {}
