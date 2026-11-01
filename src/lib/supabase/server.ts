import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// Per-request client for Server Components, Server Actions and Route Handlers.
// Acts as the signed-in user (publishable key + session cookie) → RLS applies.
// Create a new one per request; never store it in a module-level variable.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, which cannot write cookies.
          // Safe to ignore: src/proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}
