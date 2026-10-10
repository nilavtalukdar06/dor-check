import "server-only";

import {
  auth,
  currentUser,
  type User as ClerkUser,
} from "@clerk/nextjs/server";
import { cache } from "react";
import { Prisma, UserRole } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";

export type ClerkUserInput = {
  clerkId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  role: UserRole;
};

/** Role lives in Clerk publicMetadata.role; anything unknown is a traveller. */
export function parseRole(value: unknown): UserRole {
  const role = typeof value === "string" ? value.toUpperCase() : "";
  return role in UserRole ? (role as UserRole) : UserRole.TRAVELLER;
}

const fullName = (first?: string | null, last?: string | null) =>
  [first, last].filter(Boolean).join(" ").trim() || null;

export function fromClerkUser(user: ClerkUser): ClerkUserInput {
  return {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    name: fullName(user.firstName, user.lastName) ?? user.username ?? null,
    imageUrl: user.hasImage ? user.imageUrl : null,
    role: parseRole(user.publicMetadata?.role),
  };
}

/** Shape of the Clerk webhook `user.*` payload fields we use. */
export type ClerkWebhookUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  image_url: string | null;
  has_image?: boolean;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
  public_metadata: Record<string, unknown> | null;
};

export function fromWebhookUser(data: ClerkWebhookUser): ClerkUserInput {
  const primary =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id) ??
    data.email_addresses[0];
  return {
    clerkId: data.id,
    email: primary?.email_address ?? null,
    name: fullName(data.first_name, data.last_name) ?? data.username ?? null,
    imageUrl: data.has_image === false ? null : data.image_url,
    role: parseRole(data.public_metadata?.role),
  };
}

/**
 * Create or update the User row and make sure it has preferences and a personal
 * "My trips" workspace. Safe to call from both the webhook and the sign-in path:
 * an advisory lock per Clerk id keeps the two from creating duplicates.
 */
export async function upsertUser(input: ClerkUserInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${input.clerkId}))`,
    );

    const user = await tx.user.upsert({
      where: { clerkId: input.clerkId },
      create: { ...input, preference: { create: {} } },
      update: {
        email: input.email,
        name: input.name,
        imageUrl: input.imageUrl,
        role: input.role,
        deletedAt: null,
      },
    });

    const hasPersonal = await tx.workspace.findFirst({
      where: { ownerId: user.id, isPersonal: true },
      select: { id: true },
    });
    if (!hasPersonal) {
      await tx.workspace.create({
        data: {
          name: "My trips",
          isPersonal: true,
          ownerId: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });
    }
    if (!(await tx.userPreference.findUnique({ where: { userId: user.id } }))) {
      await tx.userPreference.create({ data: { userId: user.id } });
    }
    return user;
  });
}

export async function deleteUserByClerkId(clerkId: string) {
  await prisma.user.deleteMany({ where: { clerkId } });
}

/**
 * The signed-in user's database row, or null when signed out. Creates the row on
 * first sight, so the app works even if the Clerk webhook has not arrived yet.
 */
export const getCurrentUser = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing && !existing.deletedAt) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  return upsertUser(fromClerkUser(clerkUser));
});

/** The user's personal workspace id (where investigations are filed by default). */
export const getPersonalWorkspace = cache(async (userId: string) =>
  prisma.workspace.findFirstOrThrow({
    where: { ownerId: userId, isPersonal: true },
  }),
);
