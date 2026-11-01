"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  /** Shown after sign-up when the user still has to confirm their email. */
  notice?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Supabase Auth error codes → Thai messages. Unknown codes get a generic one
// (never echo the raw message: it may reveal whether an email is registered).
const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  email_not_confirmed: "กรุณายืนยันอีเมลก่อน โดยกดลิงก์ในอีเมลที่เราส่งไป",
  user_banned: "บัญชีนี้ถูกระงับการใช้งาน",
  user_already_exists: "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ",
  email_exists: "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ",
  weak_password: `รหัสผ่านง่ายเกินไป ต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`,
  over_request_rate_limit: "ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
  over_email_send_rate_limit: "ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  signup_disabled: "ปิดรับสมัครสมาชิกชั่วคราว",
};

function authError(code: string | undefined, where: string, raw: unknown): AuthFormState {
  if (code && AUTH_ERRORS[code]) return { error: AUTH_ERRORS[code] };
  console.error(`[action:${where}]`, raw);
  return { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
}

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  if (!EMAIL_RE.test(email) || !password) return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return authError(error.code, "signIn", error);

  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  if (!EMAIL_RE.test(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (password.length < MIN_PASSWORD) return { error: AUTH_ERRORS.weak_password };
  if (password.length > 72) return { error: "รหัสผ่านยาวเกินไป (ไม่เกิน 72 ตัวอักษร)" };
  if (formData.get("accept") !== "on") {
    return { error: "กรุณายอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว" };
  }

  const next = safeNext(formData.get("next"));
  const origin = await requestOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) return authError(error.code, "signUp", error);

  // Email confirmation off (local dev) → signed in right away.
  if (data.session) redirect(next);

  // Confirmation on → no session yet. Supabase returns the same response for an
  // already-registered email (anti-enumeration), so the notice says the same.
  return { notice: `เราส่งลิงก์ยืนยันไปที่ ${email} แล้ว กดลิงก์ในอีเมลเพื่อเริ่มใช้งาน (รับ 5 coin ฟรี)` };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
