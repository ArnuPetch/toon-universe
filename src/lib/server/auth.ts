import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "./errors";

// The ONLY source of user ids for the service-role RPCs. getClaims() verifies
// the JWT signature (never trust getSession() on the server).
// Cached per request so many components can call it cheaply.
export const getClaims = cache(async () => {
  // Request-time only: verifying the JWT compares its expiry with the clock,
  // which Next.js won't allow while prerendering (cacheComponents).
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return data.claims;
});

/** Verified user id, or null if signed out. */
export async function getUserId(): Promise<string | null> {
  const claims = await getClaims();
  return claims?.sub ?? null;
}

export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new AppError("not_authenticated");
  return userId;
}

/**
 * Fast pre-check from the JWT's app_metadata (user_metadata is user-editable
 * and must never be used). The RPC re-checks the role in the DB, which also
 * catches a role revoked after the token was issued.
 */
export async function requireAdminId(): Promise<string> {
  const claims = await getClaims();
  if (!claims?.sub) throw new AppError("not_authenticated");
  if (claims.app_metadata?.role !== "admin") throw new AppError("not_admin");
  return claims.sub;
}
