import type { Context } from "hono";

/**
 * Identity of an authenticated member, independent of how they signed in.
 *
 * Members are keyed by (issuer, subject) so identities can come from local
 * accounts ("local"), a hosting platform, or — later — federated sign-in,
 * without any schema changes.
 */
export interface MemberIdentity {
  /** Identity provider, e.g. "local" for accounts in this instance's DB. */
  issuer: string;
  /** Stable member id within the issuer. */
  subject: string;
  /** Name to show next to the member's activity. */
  displayName: string;
}

/** Host-provided resolver mapping a request to the current member (or null). */
export type ResolveMember = (c: Context) => Promise<MemberIdentity | null>;

/** Issuer for member accounts stored locally in this instance's database. */
export const LOCAL_MEMBER_ISSUER = "local";
