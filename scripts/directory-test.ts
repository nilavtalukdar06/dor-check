import prisma from "../src/lib/prisma";
import { createProperty, deleteProperty, propertyInputSchema, setPropertyVerified, updateProperty } from "../src/server/directory";

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok ? "" : extra ?? "");
  if (!ok) failures++;
};

async function main() {
  const actor = await prisma.user.create({ data: { clerkId: `test_${Date.now()}`, name: "Directory test", role: "MODERATOR" } });
  const district = await prisma.district.findUniqueOrThrow({ where: { slug: "east-khasi-hills" } });
  let propertyId: string | null = null;
  try {
    // create
    const p = await createProperty(actor.id, {
      name: "Test Pine Homestay", type: "STAY", districtId: district.id,
      domain: "https://WWW.PineTest.example/book", phone: "+91 98000 99999", businessUpi: "PineTest@DemoBank", lat: "25.57", lng: "91.88", tags: ["test"],
    });
    propertyId = p.id;
    check("create: slug from name", p.slug === "test-pine-homestay", p.slug);
    check("create: domain normalised", p.domain === "pinetest.example", p.domain);
    check("create: not verified, active", !p.verified && p.isActive);
    let idents = await prisma.propertyIdentifier.findMany({ where: { propertyId: p.id }, include: { identifier: true } });
    check("create: 3 business identifiers", idents.length === 3 && idents.every((i) => i.identifier.isBusiness), idents.length);
    check("create: UPI lower-cased", idents.some((i) => i.identifier.kind === "UPI" && i.identifier.value === "pinetest@demobank"));

    // duplicate name gets a unique slug
    const dup = await createProperty(actor.id, { name: "Test Pine Homestay", type: "STAY", districtId: district.id });
    check("create: duplicate name gets -2 slug", dup.slug === "test-pine-homestay-2", dup.slug);
    await prisma.property.delete({ where: { id: dup.id } });

    // verify
    const v = await setPropertyVerified(actor.id, p.id, true);
    check("verify: flag, time and moderator set", v.verified && !!v.verifiedAt && v.verifiedById === actor.id);
    const uv = await setPropertyVerified(actor.id, p.id, false);
    check("unverify: cleared", !uv.verified && uv.verifiedAt === null);

    // update replaces identifiers
    const u = await updateProperty(actor.id, p.id, { name: "Test Pine Homestay", type: "STAY", districtId: district.id, domain: "pinetest-new.example" });
    check("update: fields changed", u.domain === "pinetest-new.example" && u.phone === null);
    idents = await prisma.propertyIdentifier.findMany({ where: { propertyId: p.id }, include: { identifier: true } });
    check("update: identifiers resynced to 1", idents.length === 1 && idents[0].identifier.value === "pinetest-new.example", idents.map((i) => i.identifier.value));

    // soft delete
    const d = await deleteProperty(actor.id, p.id, "test cleanup");
    check("delete: soft (row kept, inactive)", !d.isActive && !!(await prisma.property.findUnique({ where: { id: p.id } })));

    // audit trail
    const actions = await prisma.moderationAction.findMany({ where: { targetId: p.id }, orderBy: { createdAt: "asc" } });
    check("audit: moderation actions in order", actions.map((a) => a.action).join(",") === "create,verify_property,unverify_property,edit,delete", actions.map((a) => a.action));
    const audits = await prisma.auditLog.count({ where: { entityId: p.id } });
    check("audit: audit log rows written", audits === 5, audits);

    // validation
    for (const [label, bad] of [
      ["short name", { name: "A", type: "STAY", districtId: district.id }],
      ["bad type", { name: "Valid Name", type: "HOTEL", districtId: district.id }],
      ["bad domain", { name: "Valid Name", type: "STAY", districtId: district.id, domain: "not a domain" }],
      ["bad latitude", { name: "Valid Name", type: "STAY", districtId: district.id, lat: "200" }],
      ["bad UPI", { name: "Valid Name", type: "STAY", districtId: district.id, businessUpi: "nope" }],
      ["missing district", { name: "Valid Name", type: "STAY", districtId: "" }],
    ] as const) {
      check(`validation rejects: ${label}`, !propertyInputSchema.safeParse(bad).success);
    }
    check("validation: empty strings treated as blank", propertyInputSchema.safeParse({ name: "Valid Name", type: "TAXI", districtId: district.id, domain: "", phone: "", lat: "" }).success);
  } finally {
    if (propertyId) {
      await prisma.moderationAction.deleteMany({ where: { targetId: propertyId } });
      await prisma.auditLog.deleteMany({ where: { entityId: propertyId } });
      await prisma.property.deleteMany({ where: { id: propertyId } });
    }
    await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
    await prisma.user.delete({ where: { id: actor.id } });
    await prisma.identifier.deleteMany({ where: { properties: { none: {} }, reports: { none: {} }, investigations: { none: {} }, value: { contains: "pinetest" } } });
  }
  console.log(failures ? `\n${failures} FAILED` : "\nAll directory checks passed");
  process.exitCode = failures ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
