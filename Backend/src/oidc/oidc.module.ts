import {
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Provider from 'oidc-provider';
import type { ClientMetadata } from 'oidc-provider';
import { DataSource } from 'typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountsService } from '../accounts/accounts.service';
import { describeError } from '../common/describe-error';
import { AppConfig } from '../config/app-config';
import { loadClients } from './clients';
import { OidcSessionsService } from './oidc-sessions.service';
import { OIDC_CLIENTS, OIDC_KEYS, OIDC_PROVIDER } from './oidc.constants';
import { deleteExpiredPayloads } from './postgres-adapter';
import { createProvider } from './provider.factory';
import { loadProviderKeys, type ProviderKeys } from './provider-keys';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Module({
  imports: [AccountsModule],
  providers: [
    {
      provide: OIDC_KEYS,
      inject: [AppConfig, ConfigService],
      useFactory: async (
        app: AppConfig,
        config: ConfigService,
      ): Promise<ProviderKeys> => {
        const { keys, generated } = await loadProviderKeys({
          jwks: config.get<string>('OIDC_JWKS'),
          cookieKeys: config.get<string>('OIDC_COOKIE_KEYS'),
          production: app.production,
        });
        if (generated.length > 0) {
          new Logger('OidcModule').warn(
            `${generated.join(' and ')} not set: throwaway values are used until the next restart.`,
          );
        }
        return keys;
      },
    },
    {
      provide: OIDC_CLIENTS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ClientMetadata[] =>
        loadClients(
          config.get<string>('OIDC_CLIENTS_FILE') ??
            'config/clients.development.json',
        ),
    },
    {
      provide: OIDC_PROVIDER,
      inject: [AppConfig, OIDC_KEYS, OIDC_CLIENTS, DataSource, AccountsService],
      useFactory: (
        app: AppConfig,
        keys: ProviderKeys,
        clients: ClientMetadata[],
        dataSource: DataSource,
        accounts: AccountsService,
      ): Provider =>
        createProvider({
          issuer: app.issuer,
          publicUrl: app.publicUrl,
          sessionTtlSeconds: app.sessionTtlSeconds,
          clients,
          keys,
          dataSource,
          findAccount: (id) => accounts.findById(id),
        }),
    },
    OidcSessionsService,
  ],
  exports: [OIDC_PROVIDER, OIDC_KEYS, OIDC_CLIENTS, OidcSessionsService],
})
export class OidcModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OidcModule.name);
  private cleanup?: NodeJS.Timeout;

  constructor(
    @Inject(OIDC_PROVIDER) private readonly provider: Provider,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.provider.on('server_error', (_ctx, error) =>
      this.logger.error(`Provider error: ${describeError(error)}`),
    );
    // Expired sessions, codes and tokens are never read again: drop them hourly.
    this.cleanup = setInterval(() => {
      deleteExpiredPayloads(this.dataSource).catch((error: unknown) =>
        this.logger.warn(
          `Cleaning expired payloads failed: ${describeError(error)}`,
        ),
      );
    }, CLEANUP_INTERVAL_MS);
    this.cleanup.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanup);
  }
}
