import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountModule } from './account/account.module';
import { AccountsModule } from './accounts/accounts.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AccountDeletionModule } from './deletion/account-deletion.module';
import { HealthController } from './health/health.controller';
import { InteractionsModule } from './interactions/interactions.module';
import { OidcModule } from './oidc/oidc.module';
import { PasswordResetModule } from './password-reset/password-reset.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    // Per client IP, in memory: right for a single API instance. Sensitive
    // routes set stricter limits with @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60 * 1000, limit: 300 }]),
    DatabaseModule,
    AccountsModule,
    OidcModule,
    InteractionsModule,
    AccountModule,
    AccountDeletionModule,
    PasswordResetModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
