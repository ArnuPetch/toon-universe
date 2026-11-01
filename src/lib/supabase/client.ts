import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// Browser client (Client Components). Uses the publishable key + the user's
// session, so it is bound by RLS: it can read the user's own financial rows but
// never write them. createBrowserClient is a singleton internally.
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
