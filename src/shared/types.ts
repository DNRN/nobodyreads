/** Tenant record (platform mode only). */
export interface Tenant {
  id: string;
  nickname: string;
  email: string;
  password: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  bio: string | null;
  createdAt: string;
}

/** Sentinel tenant_id used in single-user (self-hosted) mode. */
export const DEFAULT_TENANT_ID = "_default";

/** Tenant_id for the platform's own frontpage (blog at / when no user blog). */
export const PLATFORM_TENANT_ID = "_platform";
