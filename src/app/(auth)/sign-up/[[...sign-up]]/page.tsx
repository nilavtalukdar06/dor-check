import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="min-h-screen w-full flex justify-center items-center">
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
