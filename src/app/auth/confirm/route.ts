import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Landing URL for the sign-up confirmation email (`emailRedirectTo`).
// Handles both link styles:
//   - default template → Supabase verifies, then redirects here with ?code= (PKCE)
//   - custom template  → {{ .SiteURL }}/auth/confirm?token_hash=…&type=email
// Confirming the email fires the DB trigger that grants the welcome coins.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  const target = ok ? next : `/login?error=confirm_failed&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(target, request.url));
}
