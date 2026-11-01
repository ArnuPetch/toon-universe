import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// Refreshes the auth token on every matched request and forwards the new
// cookies both to Server Components (request) and to the browser (response).
// This is the ONLY place that refreshes tokens on the server.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        // Cache-Control/Expires/Pragma: stop CDNs caching a Set-Cookie response.
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  // Do not put code between createServerClient and getClaims().
  // getClaims() verifies the JWT and triggers a refresh when it has expired.
  await supabase.auth.getClaims();

  // Return supabaseResponse as-is. If you need a different response, copy its
  // cookies and cache headers onto it first, or the user gets signed out.
  return supabaseResponse;
}
