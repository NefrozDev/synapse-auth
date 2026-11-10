# Synapse account

One account for every Synapse Engineering app: an OpenID Connect provider (NestJS 12 and
`oidc-provider`) with its sign-in and account pages (Angular 22), at
`auth.synapseengineering.dev`.

## Getting started

Requires Node `^24.15` and Docker.

```sh
npm --prefix Backend install && npm --prefix Frontend install
cp Backend/.env.example Backend/.env
npm run db:start      # PostgreSQL on 127.0.0.1:5434
npm run start:back    # API on http://localhost:3300
npm run start:front   # pages on http://localhost:4300
```

Open http://localhost:4300/account: it signs in through the provider like any app. Without SMTP,
password reset links are written to the API log. `Backend/config/clients.development.json` lists
the apps running locally.

## Checks

```sh
npm run backend:lint && npm run backend:test && npm run backend:test:e2e && npm run backend:build
npm run frontend:lint && npm run frontend:test && npm run frontend:build
npm run frontend:test:e2e   # accessibility in Chromium (once: npx --prefix Frontend playwright install chromium)
```

## How an app signs in

Discovery: `https://auth.synapseengineering.dev/oidc/.well-known/openid-configuration`.

1. The app redirects to `/oidc/auth` with `response_type=code`, `scope=openid profile email`, a
   PKCE challenge (S256), `state` and `nonce`. `ui_locales` picks the page language.
2. The person signs in or signs up (or nothing shows: they already are).
3. The app exchanges the code at `/oidc/token` (client secret, basic auth) and reads the ID
   token: `sub` (stable id), `preferred_username`, `given_name`, `family_name`, `name`, `email`,
   `locale`, `sid`. It opens its own session.
4. Signing out: the app ends its session, then sends the browser to `/oidc/session/end` with
   `id_token_hint` and a registered `post_logout_redirect_uri`. That signs out of every app.
5. The app receives, on its registered addresses:
   - a back-channel logout (`logout_token`, form-encoded) when a session ends anywhere: delete
     the sessions with that `sid` (or every session of that `sub`);
   - an account deletion notice (`application/secevent+jwt`, event
     `https://auth.synapseengineering.dev/events/account-deleted`, audience = the client id) when
     the account is deleted: erase what the app keeps about that `sub` and answer 2xx.
   Both are JWTs signed with the provider's key: check them against `/oidc/jwks`.

## Deployment

The service runs on the VPS next to Plano, Erudi, Semver Sage and Mailcow, with its own database in Plano's
PostgreSQL. AGENTS.md explains the setup.

### First deployment

1. **GitHub**: create `nefrozdev/synapse-auth` and push `main`. Once CI passes it publishes
   `ghcr.io/nefrozdev/synapse-auth-api` and `synapse-auth-web`; make both packages public.
2. **DNS** (Cloudflare): an `A` record `auth` to the VPS, DNS only, like `plano`.
3. **VPS**, as root:

   ```sh
   git clone <repository URL> /home/ubuntu/synapse-auth && cd /home/ubuntu/synapse-auth
   cp .env.production.example .env && chmod 600 .env
   node deploy/generate-secrets.mjs   # paste the values into .env, plus the SMTP password
   sh deploy/create-database.sh       # once: the identity role and database
   docker compose -f compose.prod.yaml pull
   docker compose -f compose.prod.yaml up -d --wait
   ```

   No Node on the VPS? Run `generate-secrets.mjs` locally and copy the values over.
4. **Mailcow**: add `auth.synapseengineering.dev` to `ADDITIONAL_SAN`, apply it, wait for the
   certificate, copy `deploy/mailcow-auth.conf` to `data/conf/nginx/auth.conf`, then `nginx -t`
   and reload, as for Plano and Erudi.
5. **Backups**: add the cron line at the top of `deploy/backup.sh`.
6. **Plano's accounts**, before deploying the Plano version that signs in here (its migration
   drops the password hashes): `sh deploy/import-plano-accounts.sh`. It keeps every id, name
   and password, can run again safely, and lists any account it had to skip.
7. **Check**: open https://auth.synapseengineering.dev/account, create an account, ask for a
   password reset, sign out.

### Updates

```sh
cd /home/ubuntu/synapse-auth && git pull
docker compose -f compose.prod.yaml pull && docker compose -f compose.prod.yaml up -d --wait
```
