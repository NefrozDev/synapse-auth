import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClientMetadata } from 'oidc-provider';

/**
 * One app allowed to sign people in here, as written in a clients file.
 * Secrets never sit in the file of a real deployment: `client_secret_env`
 * names the environment variable holding it.
 */
export interface ClientEntry {
  client_id: string;
  client_name: string;
  /** The app's home page, linked from the account page. */
  client_uri?: string;
  redirect_uris: string[];
  post_logout_redirect_uris?: string[];
  /** Where the provider tells the app that a session ended (back-channel logout). */
  backchannel_logout_uri?: string;
  /** Where the provider tells the app that an account was deleted. */
  account_deletion_uri?: string;
  client_secret?: string;
  client_secret_env?: string;
  /** "none" for an app running only in the browser (no secret, PKCE only). */
  token_endpoint_auth_method?: 'client_secret_basic' | 'none';
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function toMetadata(
  entry: ClientEntry,
  env: NodeJS.ProcessEnv,
): ClientMetadata {
  if (!entry.client_id || !entry.client_name || !entry.redirect_uris?.length) {
    throw new Error(
      'Every client needs client_id, client_name and redirect_uris.',
    );
  }
  for (const uri of [
    entry.backchannel_logout_uri,
    entry.account_deletion_uri,
  ]) {
    if (uri !== undefined && !isAbsoluteHttpUrl(uri)) {
      throw new Error(
        `Client ${entry.client_id}: ${uri} is not an http(s) URL.`,
      );
    }
  }

  const isPublic = entry.token_endpoint_auth_method === 'none';
  let secret = entry.client_secret;
  if (entry.client_secret_env) {
    secret = env[entry.client_secret_env]?.trim();
    if (!secret) {
      throw new Error(
        `Client ${entry.client_id}: ${entry.client_secret_env} is not set.`,
      );
    }
  }
  if (!isPublic && !secret) {
    throw new Error(
      `Client ${entry.client_id} needs a secret or must be public.`,
    );
  }

  const metadata: ClientMetadata = {
    client_id: entry.client_id,
    client_name: entry.client_name,
    redirect_uris: entry.redirect_uris,
    post_logout_redirect_uris: entry.post_logout_redirect_uris ?? [],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: isPublic ? 'none' : 'client_secret_basic',
  };
  if (entry.client_uri) metadata.client_uri = entry.client_uri;
  if (!isPublic) metadata.client_secret = secret;
  if (entry.backchannel_logout_uri) {
    metadata.backchannel_logout_uri = entry.backchannel_logout_uri;
    metadata.backchannel_logout_session_required = true;
  }
  if (entry.account_deletion_uri) {
    metadata.account_deletion_uri = entry.account_deletion_uri;
  }
  return metadata;
}

/** Reads the clients file, relative to the backend folder when not absolute. */
export function loadClients(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
): ClientMetadata[] {
  const entries = JSON.parse(
    readFileSync(resolve(process.cwd(), file), 'utf8'),
  ) as ClientEntry[];
  if (!Array.isArray(entries)) {
    throw new Error(`${file} must hold an array of clients.`);
  }
  const metadata = entries.map((entry) => toMetadata(entry, env));
  const ids = new Set(metadata.map((client) => client.client_id));
  if (ids.size !== metadata.length) {
    throw new Error(`${file} lists a client_id twice.`);
  }
  return metadata;
}
