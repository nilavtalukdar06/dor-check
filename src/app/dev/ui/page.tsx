import { notFound } from "next/navigation";
import { UiShowcase } from "./showcase";

export const metadata = { title: "UI kit" };

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiShowcase />;
}
