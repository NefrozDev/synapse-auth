/** The oidc-provider instance, built once at start (see OidcModule). */
export const OIDC_PROVIDER = Symbol('OIDC_PROVIDER');

/** The signing keys and cookie secrets (ProviderKeys). */
export const OIDC_KEYS = Symbol('OIDC_KEYS');

/** The registered apps, as read from the clients file (ClientMetadata[]). */
export const OIDC_CLIENTS = Symbol('OIDC_CLIENTS');

/** The scopes every Synapse app gets: they are all first-party. */
export const FIRST_PARTY_SCOPE = 'openid profile email';
