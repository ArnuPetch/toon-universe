// Error codes raised by the Postgres RPCs (SQLSTATE P0001, message = code)
// plus a few app-level codes. Keep in sync with
// supabase/migrations/*_server_functions.sql and *_coin_checkout.sql.
export const ERROR_MESSAGES = {
  // App level
  not_authenticated: "กรุณาเข้าสู่ระบบก่อน",
  unexpected_error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
  payment_unavailable: "ระบบชำระเงินขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",

  // Account
  user_not_found: "ไม่พบผู้ใช้",
  account_not_active: "บัญชีนี้ถูกระงับการใช้งาน",
  wallet_not_found: "ไม่พบกระเป๋า coin ของบัญชีนี้",
  not_admin: "ต้องเป็นผู้ดูแลระบบเท่านั้น",
  birth_date_locked: "บันทึกวันเกิดไว้แล้ว หากต้องการแก้ไขกรุณาติดต่อผู้ดูแล",

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

  // Coin pack checkout (*_coin_checkout.sql)
  coin_pack_not_found: "ไม่พบแพ็ก coin นี้",
  purchase_not_found: "ไม่พบรายการเติม coin",
  purchase_session_mismatch: "รายการชำระเงินไม่ตรงกับรายการเติม coin",
  purchase_amount_mismatch: "ยอดชำระไม่ตรงกับราคาแพ็ก",
  invalid_purchase_status: "สถานะรายการเติม coin ไม่ถูกต้อง",

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

  // Comments / reviews / reports (*_comments_reviews.sql)
  comment_not_found: "ไม่พบความคิดเห็นนี้ (อาจถูกลบไปแล้ว)",
  comment_parent_invalid: "ตอบกลับความคิดเห็นนี้ไม่ได้ (อาจถูกลบไปแล้ว)",
  rate_limited: "ส่งถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  cannot_review_own_series: "ไม่สามารถรีวิวผลงานของตัวเองได้",
  review_requires_reading: "อ่านก่อนแล้วค่อยให้คะแนนนะ",
  review_not_found: "ไม่พบรีวิวนี้",
  invalid_input: "ข้อมูลไม่ถูกต้อง",
  already_reported: "คุณรายงานรายการนี้ไปแล้ว ทีมงานจะตรวจสอบโดยเร็ว",

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
