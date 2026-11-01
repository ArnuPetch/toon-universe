import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_URL } from "./env";

// service_role client: BYPASSES RLS and is the only role allowed to EXECUTE the
// money/moderation RPCs. Server only — the `server-only` import makes the build
// fail if this module ends up in a Client Component.
//
// Never pass a user id from a request body/form into this client's RPCs; take
// it from the verified session (see src/lib/auth.ts).
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing environment variable: SUPABASE_SECRET_KEY");

  return createClient<Database>(SUPABASE_URL, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
