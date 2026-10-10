import { clerkMiddleware } from "@clerk/nextjs/server";

// Everything is private unless listed. Pages and server actions still check the user
// themselves (getCurrentUser / requireRole); this is the fast first gate.
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/offline",
  "/dev",
  "/api/inngest",
  "/api/webhooks",
];

function isPublic(pathname: string) {
  return (
    pathname === "/" ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req.nextUrl.pathname)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
