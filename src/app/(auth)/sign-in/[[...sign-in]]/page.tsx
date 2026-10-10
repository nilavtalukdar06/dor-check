import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="w-full min-h-screen flex justify-center items-center">
      <Suspense>
        <SignIn />
      </Suspense>
    </div>
  );
}
