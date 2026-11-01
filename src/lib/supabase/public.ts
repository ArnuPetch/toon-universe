import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// Anonymous client: publishable key, NO session/cookies. Reads exactly what a
// signed-out visitor may see (RLS as `anon`, age rating "all" only).
// Safe inside 'use cache' (cached results are shared by every visitor), so
// never use it for anything that depends on who is asking.
export function createPublicClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
