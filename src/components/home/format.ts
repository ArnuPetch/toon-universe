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
