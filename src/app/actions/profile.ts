"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/server/auth";
import { ERROR_MESSAGES } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string };

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Display name, username, bio (the only profile columns users may write). */
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/profile");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const bio = String(formData.get("bio") ?? "").trim();
  if ([...displayName].length > 50) return { error: "ชื่อที่แสดงยาวได้ไม่เกิน 50 ตัวอักษร" };
  if (username && !USERNAME_RE.test(username)) {
    return { error: "ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–30 ตัวอักษร" };
  }
  if ([...bio].length > 500) return { error: "แนะนำตัวยาวได้ไม่เกิน 500 ตัวอักษร" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null, username: username || null, bio: bio || null })
    .eq("id", userId);
  if (error) {
    if (error.code === "23505") return { error: "ชื่อผู้ใช้นี้มีคนใช้แล้ว" };
    console.error("[action:updateProfile]", error);
    return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
  refresh();
  return { success: "บันทึกแล้ว" };
}

/**
 * Birth date (for age-rated series). Set once; afterwards the DB trigger
 * lock_birth_date (birth_date_locked) blocks changes by the user, so a reader
 * can't edit it to unlock 18+ series — support corrects it with service_role.
 */
export async function setBirthDate(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/profile");

  const value = String(formData.get("birth_date") ?? "");
  const date = DATE_RE.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { error: "กรุณากรอกวันเกิดให้ถูกต้อง" };
  }
  if (value <= "1900-01-01" || date.getTime() > Date.now()) return { error: "กรุณากรอกวันเกิดให้ถูกต้อง" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_private_info")
    .update({ birth_date: value })
    .eq("user_id", userId)
    .is("birth_date", null)
    .select("user_id");
  if (error) {
    if (error.code === "P0001" && error.message === "birth_date_locked") {
      return { error: ERROR_MESSAGES.birth_date_locked };
    }
    console.error("[action:setBirthDate]", error);
    return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
  if (data.length === 0) return { error: ERROR_MESSAGES.birth_date_locked };
  refresh();
  return { success: "บันทึกวันเกิดแล้ว" };
}
