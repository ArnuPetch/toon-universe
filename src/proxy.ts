import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Keep in sync with VIEWER_COOKIE in src/lib/server/ranking.ts (that module is
// server-only and can't be imported here).
const VIEWER_COOKIE = "tu_vid";

export async function proxy(request: NextRequest) {
  // Anonymous viewer id for view counting (1 view per viewer per episode per day).
  // Set on the request too, so this request's Server Components already see it.
  const newViewerId = request.cookies.has(VIEWER_COOKIE) ? null : crypto.randomUUID();
  if (newViewerId) request.cookies.set(VIEWER_COOKIE, newViewerId);

  const response = await updateSession(request);

  if (newViewerId) {
    response.cookies.set(VIEWER_COOKIE, newViewerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images and the Stripe webhook (no session).
    "/((?!api/stripe/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
