import { z } from "zod";
import { Prisma, ServiceType } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { normalizeText } from "@/lib/route-key";

// Directory write logic. No auth in here: callers (server actions) must have run
// requireRole("MODERATOR") and pass the moderator's user id as `actorId`.

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

/** "https://Shop.Example/path" -> "shop.example". */
function toDomain(value: string) {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0];
  return host.replace(/^www\./, "");
}

export const propertyInputSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  type: z.enum(ServiceType),
  districtId: z.string().min(1, "Choose a district"),
  description: optionalText(1000),
  address: optionalText(300),
  domain: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform(toDomain)
      .pipe(
        z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a valid domain"),
      )
      .optional(),
  ),
  phone: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[+\d][\d\s-]{6,18}$/, "Enter a valid phone number")
      .optional(),
  ),
  email: z.preprocess(emptyToUndefined, z.email().optional()),
  businessUpi: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{2,}@[a-z0-9]{2,}$/, "Enter a valid UPI id")
      .optional(),
  ),
  registrationNumber: optionalText(60),
  lat: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(-90).max(90).optional(),
  ),
  lng: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(-180).max(180).optional(),
  ),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

export type PropertyInput = z.input<typeof propertyInputSchema>;
export type ParsedPropertyInput = z.output<typeof propertyInputSchema>;

type Tx = Prisma.TransactionClient;

async function uniqueSlug(tx: Tx, name: string) {
  const base = normalizeText(name) || "property";
  let slug = base;
  for (
    let n = 2;
    await tx.property.findUnique({ where: { slug }, select: { id: true } });
    n++
  ) {
    slug = `${base}-${n}`;
  }
  return slug;
}

/** Keep the Identifier rows that mark this property's domain, phone and UPI in sync. */
async function syncIdentifiers(
  tx: Tx,
  propertyId: string,
  p: ParsedPropertyInput,
) {
  await tx.propertyIdentifier.deleteMany({ where: { propertyId } });
  const wanted: {
    kind: "DOMAIN" | "PHONE" | "UPI";
    value: string;
    display: string;
  }[] = [];
  if (p.domain)
    wanted.push({ kind: "DOMAIN", value: p.domain, display: p.domain });
  if (p.phone)
    wanted.push({
      kind: "PHONE",
      value: p.phone.replace(/\D/g, ""),
      display: p.phone,
    });
  if (p.businessUpi)
    wanted.push({ kind: "UPI", value: p.businessUpi, display: p.businessUpi });

  for (const w of wanted) {
    const ident = await tx.identifier.upsert({
      where: { kind_value: { kind: w.kind, value: w.value } },
      create: { ...w, isBusiness: true },
      update: { isBusiness: true },
    });
    await tx.propertyIdentifier.create({
      data: { propertyId, identifierId: ident.id },
    });
  }
}

async function record(
  tx: Tx,
  actorId: string,
  propertyId: string,
  action: string,
  detail: {
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    note?: string;
  } = {},
) {
  await tx.moderationAction.create({
    data: {
      moderatorId: actorId,
      targetType: "property",
      targetId: propertyId,
      action,
      ...detail,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      action: `property.${action}`,
      entityType: "Property",
      entityId: propertyId,
    },
  });
}

const columns = (p: ParsedPropertyInput) => ({
  name: p.name,
  type: p.type,
  districtId: p.districtId,
  description: p.description ?? null,
  address: p.address ?? null,
  domain: p.domain ?? null,
  websiteUrl: p.domain ? `https://${p.domain}` : null,
  phone: p.phone ?? null,
  email: p.email ?? null,
  businessUpi: p.businessUpi ?? null,
  registrationNumber: p.registrationNumber ?? null,
  lat: p.lat ?? null,
  lng: p.lng ?? null,
  tags: p.tags,
});

export async function createProperty(actorId: string, input: PropertyInput) {
  const data = propertyInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        ...columns(data),
        slug: await uniqueSlug(tx, data.name),
        createdById: actorId,
      },
    });
    await syncIdentifiers(tx, property.id, data);
    await record(tx, actorId, property.id, "create", {
      after: { name: property.name, type: property.type },
    });
    return property;
  });
}

export async function updateProperty(
  actorId: string,
  id: string,
  input: PropertyInput,
) {
  const data = propertyInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.property.findUniqueOrThrow({ where: { id } });
    const property = await tx.property.update({
      where: { id },
      data: columns(data),
    });
    await syncIdentifiers(tx, id, data);
    await record(tx, actorId, id, "edit", {
      before: {
        name: before.name,
        domain: before.domain,
        phone: before.phone,
        businessUpi: before.businessUpi,
      },
      after: {
        name: property.name,
        domain: property.domain,
        phone: property.phone,
        businessUpi: property.businessUpi,
      },
    });
    return property;
  });
}

export async function setPropertyVerified(
  actorId: string,
  id: string,
  verified: boolean,
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.update({
      where: { id },
      data: verified
        ? { verified: true, verifiedAt: new Date(), verifiedById: actorId }
        : { verified: false, verifiedAt: null, verifiedById: null },
    });
    await record(
      tx,
      actorId,
      id,
      verified ? "verify_property" : "unverify_property",
      { note },
    );
    return property;
  });
}

/** Soft delete: the row stays so reports and investigations that point at it keep working. */
export async function deleteProperty(
  actorId: string,
  id: string,
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.update({
      where: { id },
      data: { isActive: false },
    });
    await record(tx, actorId, id, "delete", { note });
    return property;
  });
}

// ───────────────────────── Listing requests ─────────────────────────

export const LISTING_REQUESTS_PER_DAY = 3;

export type ListingRequestResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * A business (any signed-in person) asks to be listed. The request is a Property that is not
 * active and not approved, so the public directory, the map, search and the agent never see it
 * until a moderator decides. The same domain, phone or UPI id as an existing listing is refused.
 */
export async function requestListing(userId: string, input: PropertyInput & { documentEvidenceId?: string }): Promise<ListingRequestResult> {
  const parsed = propertyInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const data = parsed.data;
  if (!data.domain && !data.phone && !data.businessUpi) return { ok: false, error: "Give at least a website, a business phone or a business UPI id, so travellers can recognise you.", fieldErrors: { phone: ["Add a website, phone or UPI id"] } };

  const dayAgo = new Date(Date.now() - 86400_000);
  if ((await prisma.property.count({ where: { requestedById: userId, createdAt: { gte: dayAgo } } })) >= LISTING_REQUESTS_PER_DAY) {
    return { ok: false, error: `You can send ${LISTING_REQUESTS_PER_DAY} listing requests a day. Try again tomorrow.` };
  }
  const idents = [
    data.domain ? { kind: "DOMAIN" as const, value: data.domain } : null,
    data.phone ? { kind: "PHONE" as const, value: data.phone.replace(/\D/g, "") } : null,
    data.businessUpi ? { kind: "UPI" as const, value: data.businessUpi } : null,
  ].filter((x): x is { kind: "DOMAIN" | "PHONE" | "UPI"; value: string } => !!x);
  const clash = await prisma.propertyIdentifier.findFirst({
    where: { identifier: { OR: idents.map((i) => ({ kind: i.kind, value: i.value })) }, property: { listingStatus: { in: ["APPROVED", "PENDING"] } } },
    select: { property: { select: { name: true, listingStatus: true } } },
  });
  if (clash) {
    return { ok: false, error: clash.property.listingStatus === "PENDING" ? `A listing request with the same website, phone or UPI id is already waiting for review (${clash.property.name}).` : `${clash.property.name} is already listed with the same website, phone or UPI id. If it is yours and out of date, contact us from Help.` };
  }
  let documentEvidenceId: string | null = null;
  if (input.documentEvidenceId) {
    const ev = await prisma.evidence.findFirst({ where: { id: input.documentEvidenceId, ownerId: userId, deletedAt: null }, select: { id: true } });
    if (!ev) return { ok: false, error: "The attached document could not be found. Upload it again." };
    documentEvidenceId = ev.id;
  }
  const property = await prisma.$transaction(async (tx) => {
    const p = await tx.property.create({
      data: { ...columns(data), slug: await uniqueSlug(tx, data.name), createdById: userId, requestedById: userId, listingStatus: "PENDING", isActive: false, documentEvidenceId },
    });
    await syncIdentifiers(tx, p.id, data);
    await tx.auditLog.create({ data: { actorId: userId, action: "property.request_listing", entityType: "Property", entityId: p.id, metadata: { name: p.name } } });
    return p;
  });
  return { ok: true, id: property.id };
}

/**
 * A moderator decides a listing request: list it, list and verify it, or reject it with a reason.
 * The requester is told either way.
 */
export async function decideListing(actorId: string, id: string, decision: "list" | "verify" | "reject", reason?: string) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.property.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, listingStatus: true, requestedById: true, slug: true } });
    if (p.listingStatus !== "PENDING") throw new Error("This request was already decided.");
    const now = new Date();
    const updated = await tx.property.update({
      where: { id },
      data:
        decision === "reject"
          ? { listingStatus: "REJECTED", isActive: false, rejectionReason: reason?.trim().slice(0, 500) || "Not approved" }
          : { listingStatus: "APPROVED", isActive: true, rejectionReason: null, ...(decision === "verify" ? { verified: true, verifiedAt: now, verifiedById: actorId } : {}) },
    });
    await record(tx, actorId, id, decision === "reject" ? "reject_listing" : decision === "verify" ? "approve_and_verify_listing" : "approve_listing", { note: reason?.slice(0, 300) });
    if (p.requestedById) {
      await tx.notification.create({
        data: {
          userId: p.requestedById,
          type: "system",
          title: decision === "reject" ? `Your listing request for ${p.name} was not approved` : `${p.name} is now listed${decision === "verify" ? " and verified" : ""}`,
          body: decision === "reject" ? (reason?.slice(0, 200) ?? null) : "Travellers can now find it in the directory and on the map.",
          href: decision === "reject" ? "/directory/request" : `/directory?property=${p.slug}`,
          data: { propertyId: p.id, decision },
        },
      });
    }
    return updated;
  });
}
