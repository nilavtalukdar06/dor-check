"use server";

import { redirect } from "next/navigation";
import { INPUT_TYPES, type InputType } from "@/lib/investigation";
import prisma from "@/lib/prisma";
import { cancelInvestigation, startInvestigation } from "@/server/investigation";
import { getRole } from "@/server/roles";
import { getUsage } from "@/server/usage";
import { getCurrentUser } from "@/server/users";

export type StartState = { error?: string; limit?: boolean } | undefined;

const SERVICES = ["STAY", "TAXI", "GUIDE", "TOUR", "OTHER"] as const;
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** The form: check the limit, create the investigation, start the workflow, show the live screen. */
export async function startInvestigationAction(_prev: StartState, form: FormData): Promise<StartState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const inputType = text(form, "inputType") as InputType;
  if (!INPUT_TYPES.includes(inputType)) return { error: "Choose what you are checking." };
  const input = text(form, "input");
  if (!input) return { error: "Enter something to check." };

  const usage = await getUsage(user.id, (await getRole()) ?? "TRAVELLER");
  if (usage.limit !== null && usage.used >= usage.limit) {
    return { error: `You have used all ${usage.limit} investigations on the ${usage.planName} plan this month.`, limit: true };
  }

  const districtId = text(form, "districtId") || null;
  if (districtId && !(await prisma.district.findUnique({ where: { id: districtId }, select: { id: true } }))) return { error: "Choose a district from the list." };
  const service = text(form, "serviceType");

  const result = await startInvestigation(user, {
    inputType,
    input,
    sellerStatement: text(form, "sellerStatement") || null,
    districtId,
    serviceType: (SERVICES as readonly string[]).includes(service) ? (service as (typeof SERVICES)[number]) : null,
    options: {
      research: form.get("research") === "on",
      capture: form.get("capture") === "on",
      knowledge: form.get("knowledge") === "on",
      price: form.get("price") === "on",
    },
  });
  if (!result.ok) return { error: result.error };
  redirect(`/investigate/${result.id}`);
}

/** Stop a running investigation (owner only). */
export async function cancelInvestigationAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  return cancelInvestigation(user.id, id);
}
