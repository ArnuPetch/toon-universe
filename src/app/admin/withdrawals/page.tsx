import type { Metadata } from "next";
import Link from "next/link";
import { AdminAction } from "@/components/admin/admin-action";
import { AdminShell } from "@/components/admin/shell";
import { LinkTabs } from "@/components/browse/link-tabs";
import { ACCOUNT_STATUS_LABEL, formatDateTime, formatNumber, WITHDRAWAL_STATUS_LABEL } from "@/components/format";
import { EmptyState } from "@/components/page";
import { ACCOUNT_TONE, CARD, Pill, WITHDRAWAL_TONE } from "@/components/studio/bits";
import { getWithdrawals, type AdminWithdrawal } from "@/lib/server/admin";

// Withdrawal queue: pending → approve / reject; approved → transfer by
// PromptPay manually, then record the transfer reference.

export const metadata: Metadata = {
  title: "คำขอถอนเงิน — ผู้ดูแลระบบ",
  robots: { index: false },
};

const STATUSES = ["pending", "approved", "paid", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export default function AdminWithdrawalsPage({ searchParams }: PageProps<"/admin/withdrawals">) {
  return (
    <AdminShell
      section="/admin/withdrawals"
      title="คำขอถอนเงิน"
      sub="อนุมัติ → โอนผ่านพร้อมเพย์ตามข้อมูลด้านล่าง → บันทึกเลขอ้างอิง"
      next="/admin/withdrawals"
    >
      <Withdrawals search={searchParams as Promise<{ status?: string }>} />
    </AdminShell>
  );
}

async function Withdrawals({ search }: { search: Promise<{ status?: string }> }) {
  const sp = await search;
  const status: Status = STATUSES.find((s) => s === sp.status) ?? "pending";
  const rows = await getWithdrawals(status);
  const total = rows.reduce((t, w) => t + w.amount, 0);

  return (
    <>
      <LinkTabs
        label="สถานะ"
        options={STATUSES.map((s) => ({
          href: s === "pending" ? "/admin/withdrawals" : `/admin/withdrawals?status=${s}`,
          label: WITHDRAWAL_STATUS_LABEL[s],
          current: s === status,
        }))}
      />
      {rows.length === 0 ? (
        <EmptyState title="ไม่มีรายการ" />
      ) : (
        <>
          <p className="text-sm leading-[1.4] text-muted">
            {rows.length} รายการ · รวม {formatNumber(total)} บาท
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {rows.map((w) => (
              <li key={w.id}>
                <WithdrawalCard w={w} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function WithdrawalCard({ w }: { w: AdminWithdrawal }) {
  return (
    <article className={`${CARD} flex h-full flex-col gap-4`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-bold leading-[1.3] text-gold">{formatNumber(w.amount)} ฿</p>
          <p className="text-[13px] leading-[1.4] text-muted">#{w.id} · ขอเมื่อ {formatDateTime(w.requestedAt)}</p>
        </div>
        <Pill tone={WITHDRAWAL_TONE[w.status]}>{WITHDRAWAL_STATUS_LABEL[w.status]}</Pill>
      </header>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm leading-[1.5]">
        <dt className="text-muted">ผู้ขอ</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {w.uploader ? (
            <>
              <Link href={`/admin/users/${w.uploader.id}`} className="font-semibold hover:underline">
                {w.uploader.name}
              </Link>
              {w.uploader.status !== "active" && (
                <Pill tone={ACCOUNT_TONE[w.uploader.status]}>{ACCOUNT_STATUS_LABEL[w.uploader.status]}</Pill>
              )}
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-muted">พร้อมเพย์</dt>
        <dd className="font-mono text-[15px] font-semibold tracking-wide">{w.promptpayId}</dd>
        <dt className="text-muted">ชื่อบัญชี</dt>
        <dd>{w.accountName}</dd>
        {w.reviewedAt && (
          <>
            <dt className="text-muted">ตรวจเมื่อ</dt>
            <dd>{formatDateTime(w.reviewedAt)}</dd>
          </>
        )}
        {w.paidAt && (
          <>
            <dt className="text-muted">โอนเมื่อ</dt>
            <dd>
              {formatDateTime(w.paidAt)}
              {w.transferRef && <span className="text-muted"> · อ้างอิง {w.transferRef}</span>}
            </dd>
          </>
        )}
        {w.rejectReason && (
          <>
            <dt className="text-muted">เหตุผล</dt>
            <dd className="text-hot">{w.rejectReason === "account_banned" ? "บัญชีถูกแบน" : w.rejectReason}</dd>
          </>
        )}
      </dl>
      {w.status === "pending" && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
          <AdminAction spec={{ kind: "approve", withdrawalId: w.id }} />
          <AdminAction spec={{ kind: "reject", withdrawalId: w.id }} />
        </div>
      )}
      {w.status === "approved" && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
          <AdminAction spec={{ kind: "paid", withdrawalId: w.id }} />
        </div>
      )}
    </article>
  );
}
