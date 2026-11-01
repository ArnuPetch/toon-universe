"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { prepareCoverUpload, saveSeriesCover } from "@/app/actions/studio";
import { MAX_COVER_BYTES } from "@/lib/r2/shared";
import { Cover } from "../cover";
import { ERROR_BOX, SECONDARY_BUTTON, TEXT_BUTTON } from "../form-styles";
import { putAll, resizeCover } from "./r2-upload";

// Series cover: resized to ≤720×960 WebP in the browser, PUT straight to the
// public R2 bucket, then saveSeriesCover points the series at it (and deletes
// the old one). Covers are public, so this also refreshes the catalog cache.

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export function CoverUploader({ seriesId, title, coverKey }: { seriesId: number; title: string; coverKey: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.split(",").includes(file.type) || file.size > MAX_SOURCE_BYTES) {
      setError("เลือกรูป JPG, PNG, WebP หรือ AVIF ไม่เกิน 20 MB");
      return;
    }
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await resizeCover(file);
      } catch {
        setError("อ่านรูปนี้ไม่ได้ ลองใช้ไฟล์อื่น");
        return;
      }
      if (blob.size > MAX_COVER_BYTES) {
        setError("รูปใหญ่เกินไป ลองใช้รูปที่เล็กลง");
        return;
      }
      const prep = await prepareCoverUpload(seriesId, { contentType: blob.type, size: blob.size });
      if (!prep.ok) {
        setError(prep.message);
        return;
      }
      try {
        await putAll([blob], [prep.data.upload], () => {});
      } catch {
        setError("อัพโหลดไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
        return;
      }
      const r = await saveSeriesCover(seriesId, prep.data.key);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("ลบปกเรื่องนี้?")) return;
    setError(null);
    setBusy(true);
    const r = await saveSeriesCover(seriesId, null);
    setBusy(false);
    if (!r.ok) setError(r.message);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-4">
        <Cover
          id={seriesId}
          coverKey={coverKey}
          title={title}
          className="aspect-[3/4] w-[120px] shrink-0 rounded-xl"
          initialClassName="text-[40px] left-2.5 bottom-2.5"
        />
        <div className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            id={`${id}-cover`}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={SECONDARY_BUTTON}>
            {busy ? "กำลังอัพโหลด…" : coverKey ? "เปลี่ยนปก" : "อัพโหลดปก"}
          </button>
          {coverKey && (
            <button type="button" disabled={busy} onClick={() => void remove()} className={`${TEXT_BUTTON} hover:text-hot`}>
              ลบปก
            </button>
          )}
        </div>
      </div>
      <p className="text-xs leading-[1.5] text-muted">แนวตั้ง 3:4 (เช่น 720×960) · ระบบย่อรูปให้อัตโนมัติ</p>
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
    </div>
  );
}
