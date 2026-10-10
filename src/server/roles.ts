import "server-only";

import { auth } from "@clerk/nextjs/server";
import { forbidden, redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser, parseRole } from "./users";

const RANK: Record<UserRole, number> = {
  TRAVELLER: 0,
  MODERATOR: 1,
  ADMIN: 2,
};

/**
 * The caller's role. Clerk's session claim is authoritative (it updates the moment the
 * metadata changes); the mirrored database role is the fallback if the claim is missing.
 */
export async function getRole(): Promise<UserRole | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  const claim = sessionClaims?.metadata?.role;
  if (claim) return parseRole(claim);
  return (await getCurrentUser())?.role ?? UserRole.TRAVELLER;
}

export async function hasRole(min: UserRole) {
  const role = await getRole();
  return role !== null && RANK[role] >= RANK[min];
}

/**
 * Call at the top of every moderator page, server action and route handler.
 * Hiding the nav is cosmetic; this is the actual check.
 */
export async function requireRole(min: UserRole) {
  const role = await getRole();
  if (role === null) redirect("/sign-in");
  if (RANK[role] < RANK[min]) forbidden();
  return role;
}
