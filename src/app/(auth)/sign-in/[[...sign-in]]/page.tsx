import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
