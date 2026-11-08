import Provider, {
  type ClientMetadata,
  type Configuration,
  type KoaContextWithOIDC,
} from 'oidc-provider';
import type { DataSource } from 'typeorm';
import type { Account } from '../accounts/account.entity';
import type { ProviderKeys } from './provider-keys';
import { errorPage, logoutPage, signedOutRedirect } from './provider-pages';
import { postgresAdapter } from './postgres-adapter';

/** What the provider needs from the rest of the service. */
export interface ProviderDependencies {
  issuer: string;
  publicUrl: string;
  sessionTtlSeconds: number;
  clients: ClientMetadata[];
  keys: ProviderKeys;
  dataSource: DataSource;
  findAccount(id: string): Promise<Account | null>;
}

const SCOPE = 'openid profile email';

/** The claims an app gets about a person, by scope. */
export function claimsOf(account: Account): Record<string, unknown> {
  return {
    sub: account.id,
    preferred_username: account.username,
    given_name: account.givenName,
    family_name: account.familyName,
    name: `${account.givenName} ${account.familyName}`.trim(),
    locale: account.locale,
    updated_at: Math.floor(account.updatedAt.getTime() / 1000),
    email: account.email,
    // Addresses are not checked by a link yet: apps must not trust them as proof.
    email_verified: false,
  };
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** The origins of an app's redirect addresses, for browser-only apps' token calls. */
function originsOf(client: { redirectUris?: readonly string[] }): Set<string> {
  return new Set((client.redirectUris ?? []).map((uri) => new URL(uri).origin));
}

/**
 * oidc-provider refuses outgoing requests to private and loopback addresses
 * (SSRF protection). The back-channel logout addresses come from our own
 * clients file, not from outside input, so exactly those may reach a local or
 * Docker-network app; any other request keeps the protection.
 */
function fetchAllowingClientsOwnUris(
  clients: ClientMetadata[],
): Configuration['fetch'] {
  const trusted = new Set(
    clients.flatMap((client) =>
      typeof client.backchannel_logout_uri === 'string'
        ? [new URL(client.backchannel_logout_uri).href]
        : [],
    ),
  );
  return (url, options) => {
    const href =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (!trusted.has(href)) {
      return globalThis.fetch(url, options);
    }
    const unprotected: RequestInit & { dispatcher?: unknown } = { ...options };
    delete unprotected.dispatcher;
    return globalThis.fetch(url, unprotected);
  };
}

export function createProvider(deps: ProviderDependencies): Provider {
  const configuration: Configuration = {
    fetch: fetchAllowingClientsOwnUris(deps.clients),
    adapter: postgresAdapter(deps.dataSource),
    clients: deps.clients,
    jwks: deps.keys.jwks,
    cookies: {
      keys: deps.keys.cookieKeys,
      long: { signed: true, httpOnly: true, sameSite: 'lax' },
      short: { signed: true, httpOnly: true, sameSite: 'lax' },
    },
    async findAccount(_ctx, id) {
      const account = await deps.findAccount(id);
      if (!account) return undefined;
      return {
        accountId: account.id,
        claims: () => claimsOf(account) as { sub: string },
      };
    },
    claims: {
      openid: ['sub'],
      profile: [
        'preferred_username',
        'given_name',
        'family_name',
        'name',
        'locale',
        'updated_at',
      ],
      email: ['email', 'email_verified'],
    },
    // Apps read who signed in from the ID token, without a userinfo call.
    conformIdTokenClaims: false,
    responseTypes: ['code'],
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      backchannelLogout: { enabled: true },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: logoutPage,
        postLogoutSuccessSource: signedOutRedirect(deps.publicUrl),
      },
    },
    extraClientMetadata: {
      properties: ['account_deletion_uri'],
      validator(_ctx, key, value) {
        if (
          key === 'account_deletion_uri' &&
          value !== undefined &&
          !isHttpUrl(value)
        ) {
          throw new Error('account_deletion_uri must be an http(s) URL');
        }
      },
    },
    interactions: {
      // An API address, so the interaction cookie (limited to this path) reaches
      // the API; it redirects the browser to the Angular page.
      url: (_ctx, interaction) => `/api/interaction/${interaction.uid}`,
    },
    // Every client is a Synapse app: signing in to one needs no extra consent.
    async loadExistingGrant(ctx: KoaContextWithOIDC) {
      const { client, session, provider } = ctx.oidc;
      if (!client || !session?.accountId) return undefined;
      const grantId = session.grantIdFor(client.clientId);
      if (grantId) {
        const existing = await provider.Grant.find(grantId);
        if (existing) return existing;
      }
      const grant = new provider.Grant({
        clientId: client.clientId,
        accountId: session.accountId,
      });
      grant.addOIDCScope(SCOPE);
      await grant.save();
      return grant;
    },
    clientBasedCORS(_ctx, origin, client) {
      return originsOf(client).has(origin);
    },
    renderError: errorPage(deps.publicUrl),
    ttl: {
      Session: deps.sessionTtlSeconds,
      Grant: deps.sessionTtlSeconds,
      Interaction: 60 * 60,
      AuthorizationCode: 60,
      IdToken: 60 * 60,
      AccessToken: 60 * 60,
    },
  };

  const provider = new Provider(deps.issuer, configuration);
  // Behind Caddy and Mailcow's nginx: trust X-Forwarded-Proto, so the issuer's
  // https is seen and cookies are marked Secure.
  provider.proxy = true;
  return provider;
}
