import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/shell";
import { formatNumber } from "@/components/format";
import { ChevronRightIcon } from "@/components/icons";
import { getAdminCounts } from "@/lib/server/admin";

export const metadata: Metadata = {
  title: "ผู้ดูแลระบบ — Toon Universe",
  robots: { index: false },
};

export default function AdminHome() {
  return (
    <AdminShell section="/admin" title="ผู้ดูแลระบบ" sub="งานที่รอจัดการ" next="/admin">
      <Counts />
    </AdminShell>
  );
}

async function Counts() {
  const c = await getAdminCounts();
  const tiles = [
    { href: "/admin/reports", label: "รายงานที่รอจัดการ", value: c.openReports, hot: c.openReports > 0 },
    { href: "/admin/withdrawals?status=pending", label: "คำขอถอนรออนุมัติ", value: c.pendingWithdrawals, hot: c.pendingWithdrawals > 0 },
    { href: "/admin/withdrawals?status=approved", label: "อนุมัติแล้ว รอโอนเงิน", value: c.approvedWithdrawals, hot: c.approvedWithdrawals > 0 },
    { href: "/admin/series?filter=under_review", label: "เรื่องที่ปิดตรวจสอบอยู่", value: c.underReview, hot: false },
  ];
  return (
    <section aria-label="งานที่รอ" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
      {tiles.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="flex flex-col gap-1 rounded-[20px] bg-surface p-4 transition-colors hover:bg-surface-2 lg:p-5"
        >
          <span className="flex items-center justify-between gap-2 text-[13px] leading-[1.4] text-muted lg:text-sm">
            {t.label}
            <ChevronRightIcon size={16} className="shrink-0" />
          </span>
          <span className={`text-2xl font-bold leading-[1.3] lg:text-[28px] ${t.hot ? "text-hot" : ""}`}>
            {formatNumber(t.value)}
          </span>
        </Link>
      ))}
    </section>
  );
}
