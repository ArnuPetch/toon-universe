const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** 1234567 → "1.2M วิว" */
export function formatViews(views: number) {
  return `${compact.format(views)} วิว`;
}

/** ISO time → "12 นาทีที่แล้ว" / "3 ชม.ที่แล้ว" / "2 วันที่แล้ว" */
export function timeAgo(iso: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

const dateFmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

/** ISO time → "1 พ.ย. 2569" (Thai time) */
export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

/** Days left until `iso` (rounded up, ≥ 0). */
export function daysLeft(iso: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

export const SERIES_STATUS_LABEL = {
  ongoing: "กำลังอัพเดต",
  completed: "จบแล้ว",
  hiatus: "พักการอัพเดต",
} as const;

export const AGE_RATING_LABEL = { all: "ทุกวัย", teen: "13+", mature: "18+" } as const;
export const AGE_RATING_YEARS = { all: 0, teen: 13, mature: 18 } as const;

export const SHELF_LABEL = {
  reading: "กำลังอ่าน",
  plan_to_read: "อยากอ่าน",
  completed: "อ่านจบแล้ว",
} as const;

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

/** ISO time → "1 พ.ย. 2569 18:00" (Thai time) */
export function formatDateTime(iso: string) {
  return dateTimeFmt.format(new Date(iso));
}

/** ISO time → "2026-11-05T18:00" for <input type="datetime-local"> in Thai time. */
export function toBangkokLocalInput(iso: string) {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16);
}

export function formatNumber(n: number) {
  return n.toLocaleString("th-TH");
}

// --- Studio / admin labels ---

export const VISIBILITY_LABEL = { draft: "ฉบับร่าง", published: "เผยแพร่แล้ว" } as const;

export const MODERATION_LABEL = {
  active: "ปกติ",
  under_review: "ปิดตรวจสอบ",
  removed: "ถูกถอด",
} as const;

export const EPISODE_STATE_LABEL = {
  draft: "ฉบับร่าง",
  scheduled: "ตั้งเวลาไว้",
  released: "เผยแพร่แล้ว",
} as const;

export const READING_MODE_LABEL = { vertical: "เลื่อนลง (manhwa)", paged: "พลิกหน้า (manga)" } as const;
export const READING_DIRECTION_LABEL = { ltr: "ซ้าย → ขวา", rtl: "ขวา → ซ้าย" } as const;

export const WITHDRAWAL_STATUS_LABEL = {
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว รอโอน",
  paid: "โอนแล้ว",
  rejected: "ไม่อนุมัติ",
} as const;

export const EARNING_STATUS_LABEL = { pending: "รอถอน", withdrawn: "ถอนแล้ว", reversed: "ถูกหักคืน" } as const;
export const EARNING_SOURCE_LABEL = { unlock: "ปลดล็อกตอน", donation: "สนับสนุน" } as const;

export const ACCOUNT_STATUS_LABEL = { active: "ปกติ", suspended: "ระงับชั่วคราว", banned: "แบน" } as const;

export const REPORT_TARGET_LABEL = {
  series: "ผลงาน",
  comment: "ความคิดเห็น",
  review: "รีวิว",
  user: "ผู้ใช้",
} as const;

export const REPORT_REASON_LABEL = {
  copyright: "ละเมิดลิขสิทธิ์",
  inappropriate: "เนื้อหาไม่เหมาะสม",
  wrong_age_rating: "เรตอายุไม่ถูกต้อง",
  spam: "สแปม",
  abusive: "คำหยาบ / คุกคาม",
  unhidden_spoiler: "สปอยล์ไม่ซ่อน",
  fake_account: "บัญชีปลอม",
  impersonation: "แอบอ้างตัวตน",
} as const;

export const REPORT_STATUS_LABEL = { open: "รอจัดการ", resolved: "จัดการแล้ว", dismissed: "ยกฟ้อง" } as const;
