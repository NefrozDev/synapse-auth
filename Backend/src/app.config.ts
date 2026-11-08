import { type INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json, type Express } from 'express';
import type Provider from 'oidc-provider';
import { OIDC_PROVIDER } from './oidc/oidc.constants';

/**
 * The HTTP setup shared by the server and the end-to-end tests. The app must
 * be created with `bodyParser: false`: the provider reads its own request
 * bodies, so the JSON parser is added after it, for the API only.
 */
export function configureApp(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as Express;
  // Requests arrive through Mailcow's nginx and Caddy on private Docker
  // networks. Trusting only private and loopback hops makes req.ip the real
  // client (rate limiting) while a client-supplied X-Forwarded-For is ignored.
  express.set('trust proxy', 'loopback, uniquelocal');
  express.disable('x-powered-by');

  const provider = app.get<Provider>(OIDC_PROVIDER);
  // The OpenID Connect endpoints: /oidc/auth, /oidc/token, /oidc/jwks...
  app.use('/oidc', provider.callback());

  app.use(json({ limit: '16kb' }));
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
