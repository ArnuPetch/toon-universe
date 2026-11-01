"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { requestWithdrawalAction, savePayoutAccount } from "@/app/actions/studio";
import { ERROR_BOX, INPUT, LABEL, PRIMARY_BUTTON, SUCCESS_BOX } from "../form-styles";
import { FormStatus } from "./series-form";

export function PayoutForm({ promptpayId, accountName }: { promptpayId: string; accountName: string }) {
  const [state, action, pending] = useActionState(savePayoutAccount, {});
  const id = useId();
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="rounded-xl bg-gold/10 px-4 py-3 text-[13px] leading-[1.5] text-gold">
        ตรวจสอบเลขพร้อมเพย์และชื่อบัญชีให้ถูกต้องก่อนบันทึก — ทีมงานโอนตามข้อมูลนี้ หากโอนผิดบัญชีเพราะข้อมูลผิดจะเรียกคืนไม่ได้
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-pp`} className={LABEL}>
            เลขพร้อมเพย์
          </label>
          <input
            id={`${id}-pp`}
            name="promptpay_id"
            inputMode="numeric"
            required
            maxLength={20}
            defaultValue={promptpayId}
            placeholder="เบอร์มือถือ / เลขบัตรประชาชน"
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={LABEL}>
            ชื่อบัญชี
          </label>
          <input
            id={`${id}-name`}
            name="account_name"
            required
            maxLength={100}
            defaultValue={accountName}
            placeholder="ชื่อ-นามสกุลตามบัญชี"
            className={INPUT}
          />
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-[1.5] text-text-2">
        <input type="checkbox" name="confirm" required className="mt-1 size-4 accent-primary" />
        ฉันตรวจสอบแล้วว่าเลขพร้อมเพย์และชื่อบัญชีถูกต้อง
      </label>
      <FormStatus id={`${id}-error`} state={state} />
      <div>
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "กำลังบันทึก…" : "บันทึกบัญชีรับเงิน"}
        </button>
      </div>
    </form>
  );
}

export function WithdrawButton({ amount, disabledReason }: { amount: number; disabledReason: string | null }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending || disabledReason !== null}
        onClick={() => {
          if (!confirm(`ขอถอน ${amount.toLocaleString("th-TH")} บาท ทั้งหมดที่ถอนได้?`)) return;
          setResult(null);
          start(async () => {
            const r = await requestWithdrawalAction();
            setResult(
              r.ok
                ? { ok: true, text: `ส่งคำขอถอน ${r.data.amount.toLocaleString("th-TH")} บาทแล้ว รอทีมงานตรวจสอบ` }
                : { ok: false, text: r.message },
            );
          });
        }}
        className={PRIMARY_BUTTON}
      >
        {pending ? "กำลังส่งคำขอ…" : "ขอถอนเงิน"}
      </button>
      {disabledReason && <p className="text-xs leading-[1.5] text-muted">{disabledReason}</p>}
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? SUCCESS_BOX : ERROR_BOX}>
          {result.text}
        </p>
      )}
    </div>
  );
}
