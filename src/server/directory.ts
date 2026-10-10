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
