import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export const instant = false;

export default async function Home() {
  await auth.protect();
  return (
    <div className="w-full p-4">
      <UserButton />
    </div>
  );
}
