import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUp />
    </Suspense>
  );
}
