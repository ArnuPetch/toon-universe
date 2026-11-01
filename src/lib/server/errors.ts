// Error codes raised by the Postgres RPCs (SQLSTATE P0001, message = code)
// plus a few app-level codes. Keep in sync with
// supabase/migrations/*_server_functions.sql.
export const ERROR_MESSAGES = {
  // App level
  not_authenticated: "กรุณาเข้าสู่ระบบก่อน",
  unexpected_error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",

  // Account
  user_not_found: "ไม่พบผู้ใช้",
  account_not_active: "บัญชีนี้ถูกระงับการใช้งาน",
  wallet_not_found: "ไม่พบกระเป๋า coin ของบัญชีนี้",
  not_admin: "ต้องเป็นผู้ดูแลระบบเท่านั้น",

  // Reader: unlock / donate
  episode_not_available: "ตอนนี้ไม่เปิดให้อ่านในขณะนี้",
  own_episode: "ไม่ต้องปลดล็อกตอนของตัวเอง",
  episode_is_free: "ตอนนี้อ่านฟรี ไม่ต้องปลดล็อก",
  age_restricted: "เนื้อหานี้จำกัดอายุ",
  insufficient_coins: "coin ไม่พอ กรุณาเติม coin",
  donation_below_minimum: "สนับสนุนขั้นต่ำ 10 coin",
  cannot_donate_to_self: "ไม่สามารถสนับสนุนตัวเองได้",
  recipient_not_available: "ผู้รับไม่สามารถรับการสนับสนุนได้ในขณะนี้",
  series_not_available: "เรื่องนี้ไม่เปิดให้บริการในขณะนี้",

  // Content removal
  series_not_found: "ไม่พบเรื่องนี้",
  episode_not_found: "ไม่พบตอนนี้",

  // Withdrawal
  below_minimum_withdrawal: "ยอดที่ถอนได้ยังไม่ถึงขั้นต่ำ",
  payout_account_missing: "กรุณาเพิ่มบัญชีรับเงินก่อนถอน",
  withdrawal_not_found: "ไม่พบคำขอถอนเงิน",
  withdrawal_not_pending: "คำขอถอนเงินนี้ถูกดำเนินการไปแล้ว",
  withdrawal_not_approved: "คำขอถอนเงินนี้ยังไม่ได้รับอนุมัติ",
  reject_reason_required: "กรุณาระบุเหตุผลที่ปฏิเสธ",
  transfer_ref_required: "กรุณาระบุเลขอ้างอิงการโอน",

  // Sanctions
  cannot_sanction_self: "ไม่สามารถลงโทษบัญชีตัวเองได้",
  reason_required: "กรุณาระบุเหตุผล",
  already_banned: "บัญชีนี้ถูกแบนอยู่แล้ว",
  sanction_not_active: "บทลงโทษนี้สิ้นสุดไปแล้ว",

  // Content hold
  series_not_active: "เรื่องนี้ไม่อยู่ในสถานะที่ปิดตรวจได้",
  series_not_under_review: "เรื่องนี้ไม่ได้อยู่ระหว่างปิดตรวจ",
  hold_not_open: "ไม่มีการปิดตรวจที่เปิดอยู่",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_MESSAGES, value);
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; detail?: string };

export function fail(code: ErrorCode, detail?: string): ActionResult<never> {
  return { ok: false, code, message: ERROR_MESSAGES[code], detail };
}

/** Thrown by auth guards; converted to an ActionResult by the RPC wrappers. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "AppError";
  }
}
