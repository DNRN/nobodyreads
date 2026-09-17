/**
 * Federation client configuration. An auxiliary plot delegates sign-in to a
 * community hub (identity provider) configured entirely via environment
 * variables. This module is tenant-agnostic and knows nothing about which hub
 * it points at.
 */

export interface FederationConfig {
  /** Base URL of the community hub, without a trailing slash. */
  issuerUrl: string;
  /** Human-friendly hub name for sign-in UI. */
  issuerName: string;
  /** OAuth2 client id issued by the hub when this plot registered. */
  clientId: string;
  /** OAuth2 client secret issued by the hub when this plot registered. */
  clientSecret: string;
}

/** Federation is enabled once the hub URL and client credentials are present. */
export function isFederationEnabled(): boolean {
  return Boolean(
    process.env.FEDERATION_ISSUER_URL &&
      process.env.FEDERATION_CLIENT_ID &&
      process.env.FEDERATION_CLIENT_SECRET
  );
}

/** Resolve the federation config from env, or null when not configured. */
export function getFederationConfig(): FederationConfig | null {
  if (!isFederationEnabled()) return null;

  const issuerUrl = (process.env.FEDERATION_ISSUER_URL as string).replace(
    /\/+$/,
    ""
  );

  return {
    issuerUrl,
    issuerName: process.env.FEDERATION_ISSUER_NAME || issuerUrl,
    clientId: process.env.FEDERATION_CLIENT_ID as string,
    clientSecret: process.env.FEDERATION_CLIENT_SECRET as string,
  };
}
