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
