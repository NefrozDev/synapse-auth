# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this is

The shared account of every Synapse Engineering app (Plano, Erudi, Semver Sage, the portfolio):
an OpenID Connect provider at `auth.synapseengineering.dev`. Apps sign people in here and keep
their own sessions; the provider's session is the single sign-on.

## Repository Layout

- `Backend/` is the NestJS 12 API with `oidc-provider` 9 (CommonJS build; Node 24 loads the
  ES-module-only `oidc-provider` and `jose` through `require`).
- `Frontend/` is the Angular 22 app: the sign-in, sign-up, password and account pages.
- `deploy/` holds the Caddyfile, the Mailcow nginx block, the database and backup scripts, and
  `generate-secrets.mjs`. `compose.prod.yaml` is the VPS stack; `compose.yaml` the local database.

## Architecture

### Backend

- `configureApp()` (`app.config.ts`) is shared by `main.ts` and the e2e tests. The app is created
  with `bodyParser: false`: the provider (mounted at `/oidc`) reads its own bodies, and the JSON
  parser is added after it for `/api` only.
- `oidc/provider.factory.ts` configures the provider: code flow with PKCE only, back-channel
  logout, RP-initiated logout, profile and email claims in the ID token, every client first-party
  (`loadExistingGrant` grants without a consent screen). Its storage is one table,
  `oidc_payloads` (`postgres-adapter.ts`), whose `account_id` cascades from `accounts`.
- Clients come from a JSON file (`OIDC_CLIENTS_FILE`, `config/clients.*.json`). Secrets never sit
  in it: `client_secret_env` names the variable. `account_deletion_uri` is our own metadata.
- `oidc-provider` refuses outgoing requests to private addresses (SSRF). Our `fetch` lets exactly
  the clients' back-channel logout addresses through, so production can use Docker-network URLs
  (`http://api:3000/...`, `http://erudi-api:8080/...`, `http://semver-sage-app:3000/...`); keep
  any other request protected.
- Clients: Plano, Erudi and Semver Sage sign in from their servers (secret, back-channel logout,
  deletion notices). The portfolio (`portfolio`, on Vercel) signs in from the browser: a public
  client with PKCE only, no secret and no back-channel; `clientBasedCORS` lets its origin call the
  token endpoint.
- Interactions: the provider sends browsers to `/api/interaction/:uid`, which redirects to the
  Angular page `/interaction/:uid`. The interaction cookie is limited to `/api/interaction/:uid`,
  so every interaction call lives under it (`details`, `login`, `register`, `consent`, `abort`) and
  answers with `{ redirectTo }` for the page to follow. 410 means the interaction is gone.
- The account page is a client of its own provider (`account`, public): `/api/account/sign-in`
  starts an ordinary authorization request, and the account API reads the provider's session
  (`OidcSessionsService.current()`). Its callback needs the state cookie and a code; anything else
  goes to `/account?signInFailed=1`, which offers to retry instead of looping.
- Ending a session (`OidcSessionsService`) tells every app that used it (back-channel logout) and
  revokes its grant. A password change keeps the current session; a reset or deletion ends all.
- Deleting an account queues a signed notice (`account_deletion_notices`, Security Event Token
  style, `typ: secevent+jwt`, signed with the provider key) for every client with an
  `account_deletion_uri`, sent until it answers 2xx and dropped (with an error log) after 14 days.
- Accounts keep Plano's rules: usernames `^[a-zA-Z0-9._-]{3,30}$`, unique case-insensitively,
  passwords 8 to 128 characters hashed with Plano's scrypt format (`password.service.ts`, copied
  as is so Plano's hashes import unchanged). Sign-in takes a username or an e-mail address.
- `AllowedOriginGuard` refuses state-changing requests from another origin than `PUBLIC_URL`.
  Routes that check a password or send mail use `SENSITIVE_THROTTLE`
  (`AUTH_RATE_LIMIT_PER_MINUTE`, default 10 per IP and minute).
- Errors are English; the pages pick their text from the status and the `field` of a 400.

### Frontend

- Standalone, zoneless, OnPush, signals, signal forms, `rxResource`, built-in control flow, as in
  Erudi. Server field errors are returned from the submission action (`fieldTree`).
- Texts go through Transloco in French and English (`src/i18n`); both files keep the same keys.
  The language is the app's `ui_locales`, then the account's, then the browser's. Accounts may hold
  Plano's other languages: pages show them in English.
- Full-page navigations (back to the provider or to an app) go through `BROWSER_LOCATION`, so
  specs can see them. Specs fake `IdentityApi` (`src/testing/fake-api.ts`) and render real routes
  with `RouterTestingHarness`.
- Nothing loads from another origin (system fonts, no CDN): the terms say so. The Caddyfile's CSP
  allows scripts from the site only, so the production build does not inline critical CSS.
- `/terms` states facts (30-day session, 30-minute reset links, 14-day backups, OVHcloud, no
  trackers, deletion reaching every app). Keep them true, and move `TERMS_UPDATED_ON` with them.

## Common Commands

| Task | Command (from the root) |
| --- | --- |
| Local PostgreSQL (port 5434) | `npm run db:start` |
| API (port 3300) | `npm run start:back` |
| Pages (port 4300, proxies `/api` and `/oidc`) | `npm run start:front` |
| Backend lint, unit and e2e tests, build | `npm run backend:lint`, `backend:test`, `backend:test:e2e`, `backend:build` |
| Frontend lint, tests, build | `npm run frontend:lint`, `frontend:test`, `frontend:build` |

Backend tests need Docker: Testcontainers starts PostgreSQL 18 once per run and each suite gets its
own database. E2e tests stand up a fake app (`startReceiver()`) to receive logout tokens and
deletion notices, and check their signatures against `/oidc/jwks`.

## Deployment

- Target: the OVH VPS shared with Mailcow, Plano, Erudi and Semver Sage, at
  `auth.synapseengineering.dev`.
  Its Cloudflare record is the owner's to set (DNS only). Never change DNS, the firewall,
  Mailcow's ports or its certificate flow.
- CI (`.github/workflows/ci.yml`) checks both apps and, on `main` only, pushes
  `ghcr.io/nefrozdev/synapse-auth-api` and `synapse-auth-web`. Never build images on the VPS.
- The identity database and role live in Plano's PostgreSQL (`deploy/create-database.sh`); the API
  joins Plano's network (`PLANO_NETWORK`), where it also reaches Plano's and Erudi's APIs, and
  Mailcow's network, where it reaches Semver Sage's app (`semver-sage-app`). Mailcow's nginx
  terminates HTTPS (`deploy/mailcow-auth.conf`) and reaches `identity-web` over its network.
  Service names stay `identity-*`, and keep `mem_limit` on both.
- Settings come from the VPS `.env` only (`.env.production.example`); `node
  deploy/generate-secrets.mjs` prints fresh secrets. Changing `OIDC_JWKS` signs everyone out.
- Adding an app: a client in `Backend/config/clients.production.json` (and the development one),
  its secret variable in `compose.prod.yaml` and `.env.production.example`, and the same secret in
  the app's own `.env`.

## Commits

- Commit once a change is finished and verified with lint, tests and build.
- Titles: `Type: lowercase description` (`Feat`, `Impr`, `Refa`, `Chore`, `Bugfix`), with a body
  when the title is not enough; body lines at most 72 characters.
- Never commit secrets: `.env` files stay local or on the VPS.
