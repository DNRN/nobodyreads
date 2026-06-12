import { randomUUID } from "node:crypto";
import { and, eq, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { Database } from "../db/index.js";
import { member, spaceMembership, postLike } from "../db/schema.js";
import type { MemberIdentity } from "./types.js";

const BCRYPT_ROUNDS = 12;

/** Member account row without the password hash. */
export interface MemberRecord {
  memberId: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

function toMemberRecord(row: typeof member.$inferSelect): MemberRecord {
  return {
    memberId: row.memberId,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt,
  };
}

// --- Local member accounts (self-hosted mode) ---

/** Create a local member account. Returns null when the email is taken. */
export async function createMember(
  db: Database,
  input: { email: string; password: string; displayName?: string }
): Promise<MemberRecord | null> {
  const existing = await db
    .select({ memberId: member.memberId })
    .from(member)
    .where(eq(member.email, input.email))
    .limit(1);
  if (existing.length > 0) return null;

  const row = {
    memberId: randomUUID(),
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    displayName: input.displayName?.trim() || null,
  };
  await db.insert(member).values(row);
  return getMemberById(db, row.memberId);
}

export async function getMemberById(
  db: Database,
  memberId: string
): Promise<MemberRecord | null> {
  const rows = await db
    .select()
    .from(member)
    .where(eq(member.memberId, memberId))
    .limit(1);
  return rows.length > 0 ? toMemberRecord(rows[0]) : null;
}

/** Verify email + password. Returns the member on success, null otherwise. */
export async function verifyMemberCredentials(
  db: Database,
  email: string,
  password: string
): Promise<MemberRecord | null> {
  const rows = await db
    .select()
    .from(member)
    .where(eq(member.email, email))
    .limit(1);
  if (rows.length === 0) return null;
  const ok = await bcrypt.compare(password, rows[0].passwordHash);
  return ok ? toMemberRecord(rows[0]) : null;
}

// --- Space memberships ---

export async function joinSpace(
  db: Database,
  tenantId: string,
  identity: MemberIdentity
): Promise<void> {
  await db
    .insert(spaceMembership)
    .values({
      tenantId,
      memberIssuer: identity.issuer,
      memberSubject: identity.subject,
      displayName: identity.displayName,
    })
    .onConflictDoNothing();
}

export async function leaveSpace(
  db: Database,
  tenantId: string,
  identity: MemberIdentity
): Promise<void> {
  await db
    .delete(spaceMembership)
    .where(membershipFilter(tenantId, identity));
}

export async function isSpaceMember(
  db: Database,
  tenantId: string,
  identity: MemberIdentity
): Promise<boolean> {
  const rows = await db
    .select({ tenantId: spaceMembership.tenantId })
    .from(spaceMembership)
    .where(membershipFilter(tenantId, identity))
    .limit(1);
  return rows.length > 0;
}

export async function countSpaceMembers(
  db: Database,
  tenantId: string
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(spaceMembership)
    .where(eq(spaceMembership.tenantId, tenantId));
  return rows[0]?.value ?? 0;
}

function membershipFilter(tenantId: string, identity: MemberIdentity) {
  return and(
    eq(spaceMembership.tenantId, tenantId),
    eq(spaceMembership.memberIssuer, identity.issuer),
    eq(spaceMembership.memberSubject, identity.subject)
  );
}

// --- Post likes ---

export async function likePost(
  db: Database,
  tenantId: string,
  pageId: string,
  identity: MemberIdentity
): Promise<void> {
  await db
    .insert(postLike)
    .values({
      tenantId,
      pageId,
      memberIssuer: identity.issuer,
      memberSubject: identity.subject,
    })
    .onConflictDoNothing();
}

export async function unlikePost(
  db: Database,
  tenantId: string,
  pageId: string,
  identity: MemberIdentity
): Promise<void> {
  await db.delete(postLike).where(likeFilter(tenantId, pageId, identity));
}

export async function countPostLikes(
  db: Database,
  tenantId: string,
  pageId: string
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(postLike)
    .where(and(eq(postLike.tenantId, tenantId), eq(postLike.pageId, pageId)));
  return rows[0]?.value ?? 0;
}

export async function hasLikedPost(
  db: Database,
  tenantId: string,
  pageId: string,
  identity: MemberIdentity
): Promise<boolean> {
  const rows = await db
    .select({ pageId: postLike.pageId })
    .from(postLike)
    .where(likeFilter(tenantId, pageId, identity))
    .limit(1);
  return rows.length > 0;
}

function likeFilter(
  tenantId: string,
  pageId: string,
  identity: MemberIdentity
) {
  return and(
    eq(postLike.tenantId, tenantId),
    eq(postLike.pageId, pageId),
    eq(postLike.memberIssuer, identity.issuer),
    eq(postLike.memberSubject, identity.subject)
  );
}
