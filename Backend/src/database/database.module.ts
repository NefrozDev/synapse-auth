import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MIGRATIONS } from './migrations';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        // Every connection costs memory on the shared server: keep the pool small.
        poolSize: Number(config.get<string>('DATABASE_POOL_SIZE') ?? 5),
        autoLoadEntities: true,
        migrations: MIGRATIONS,
        // PostgreSQL runs schema changes inside the transaction, so a failing
        // migration leaves the schema untouched.
        migrationsRun: true,
        migrationsTransactionMode: 'all' as const,
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
