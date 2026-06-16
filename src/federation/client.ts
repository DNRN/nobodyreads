import type { MemberIdentity } from "../community/types.js";
import type { FederationConfig } from "./config.js";

/** Build the hub authorization URL to redirect the user to. */
export function buildAuthorizeUrl(
  config: FederationConfig,
  params: { state: string; redirectUri: string }
): string {
  const url = new URL(config.issuerUrl + "/api/federation/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface TokenResponse {
  issuer?: string;
  sub?: string;
  name?: string;
}

/**
 * Exchange an authorization code for the user's identity. This is a
 * server-to-server call authenticated with the client credentials, so the
 * returned claims can be trusted directly.
 */
export async function exchangeCodeForIdentity(
  config: FederationConfig,
  params: { code: string; redirectUri: string }
): Promise<MemberIdentity | null> {
  let res: Response;
  try {
    res = await fetch(config.issuerUrl + "/api/federation/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: params.redirectUri,
      }).toString(),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let data: TokenResponse;
  try {
    data = (await res.json()) as TokenResponse;
  } catch {
    return null;
  }

  if (!data.issuer || !data.sub) return null;
  return {
    issuer: data.issuer,
    subject: data.sub,
    displayName: data.name || data.sub,
  };
}
