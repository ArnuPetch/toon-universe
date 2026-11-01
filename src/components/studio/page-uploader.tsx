"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { prepareEpisodePagesUpload, saveEpisodePages } from "@/app/actions/studio";
import { MAX_PAGE_BYTES, MAX_PAGES, PAGE_TYPES } from "@/lib/r2/shared";
import { ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON, SUCCESS_BOX, TEXT_BUTTON } from "../form-styles";
import { MAX_ZIP_BYTES, putAll, unzipImages } from "./r2-upload";

// Pick many images or a .zip (or drop them), sorted by file name like a file
// manager ("2.jpg" before "10.jpg"), reorder, then upload: presigned PUTs
// straight to R2 (prepareEpisodePagesUpload) → saveEpisodePages replaces the
// episode's pages once every file is there.

type Item = { key: string; name: string; url: string; width: number; height: number; file: File };
type Progress = { phase: "upload"; done: number; total: number } | { phase: "save" };

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const isZip = (f: File) => f.name.toLowerCase().endsWith(".zip") || f.type === "application/zip" || f.type === "application/x-zip-compressed";

function readSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });
}

export function PageUploader({
  seriesId,
  episodeId,
  savedCount,
}: {
  seriesId: number;
  episodeId: number;
  savedCount: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const id = useId();
  const busy = progress !== null;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Free the preview object URLs when leaving the page.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  // Leaving mid-upload would lose the work: ask first.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  async function addFiles(list: FileList | File[]) {
    setError(null);
    setNotice(null);
    setReading(true);
    const skipped: string[] = [];
    const files: File[] = [];
    for (const f of list) {
      if (isZip(f)) {
        if (f.size > MAX_ZIP_BYTES) {
          skipped.push(`${f.name} (ใหญ่เกิน 1 GB)`);
          continue;
        }
        try {
          files.push(...(await unzipImages(f, skipped)));
        } catch {
          skipped.push(f.name);
        }
      } else files.push(f);
    }
    const images = files.filter((f) => {
      const ok = f.type in PAGE_TYPES && f.size <= MAX_PAGE_BYTES;
      if (!ok) skipped.push(f.name);
      return ok;
    });
    const read = await Promise.all(
      images.map(async (f): Promise<Item | null> => {
        const url = URL.createObjectURL(f);
        try {
          const { width, height } = await readSize(url);
          return { key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`, name: f.name, url, width, height, file: f };
        } catch {
          URL.revokeObjectURL(url);
          skipped.push(f.name);
          return null;
        }
      }),
    );
    setReading(false);
    const added = read.filter((x): x is Item => x !== null);
    if (added.length === 0) {
      setError("เลือกไฟล์รูป JPG, PNG, WebP, GIF, AVIF หรือไฟล์ .zip ที่มีรูป (ไม่เกิน 20 MB ต่อรูป)");
      return;
    }
    const merged = [...itemsRef.current, ...added].sort((a, b) => collator.compare(a.name, b.name));
    if (merged.length > MAX_PAGES) {
      merged.slice(MAX_PAGES).forEach((i) => URL.revokeObjectURL(i.url));
      setItems(merged.slice(0, MAX_PAGES));
      setError(`ตอนหนึ่งมีได้ไม่เกิน ${MAX_PAGES} หน้า`);
      return;
    }
    setItems(merged);
    if (skipped.length > 0) setError(`ข้ามไฟล์ที่ใช้ไม่ได้: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? " …" : ""}`);
  }

  function move(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const j = index + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    URL.revokeObjectURL(items[index].url);
    setItems(items.filter((_, i) => i !== index));
  }

  function clear() {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
  }

  async function save() {
    if (savedCount > 0 && !confirm(`แทนที่ ${savedCount} หน้าเดิมด้วย ${items.length} หน้าใหม่?`)) return;
    setError(null);
    setNotice(null);
    const pages = items;
    setProgress({ phase: "upload", done: 0, total: pages.length });
    try {
      const prep = await prepareEpisodePagesUpload(
        seriesId,
        episodeId,
        pages.map((p) => ({ contentType: p.file.type, size: p.file.size })),
      );
      if (!prep.ok) {
        setError(prep.message);
        return;
      }
      try {
        await putAll(
          pages.map((p) => p.file),
          prep.data.uploads,
          (done) => setProgress({ phase: "upload", done, total: pages.length }),
        );
      } catch {
        setError("อัพโหลดรูปไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
        return;
      }
      setProgress({ phase: "save" });
      const r = await saveEpisodePages(
        seriesId,
        episodeId,
        prep.data.batch,
        pages.map((p) => ({ contentType: p.file.type, width: p.width, height: p.height })),
      );
      if (!r.ok) {
        setError(r.message);
        return;
      }
      clear();
      setNotice(`บันทึก ${r.data.count} หน้าแล้ว`);
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length && !busy) void addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-[20px] border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary/10" : "border-line bg-surface-2"
        }`}
      >
        <p className="text-[15px] font-semibold leading-[1.4]">ลากรูปหรือไฟล์ .zip มาวางที่นี่</p>
        <p className="text-[13px] leading-[1.5] text-muted">
          เลือกได้หลายไฟล์พร้อมกัน ระบบเรียงตามชื่อไฟล์ให้ (1, 2, … 10) · ไม่เกิน {MAX_PAGES} หน้า, 20 MB ต่อรูป · .zip ไม่เกิน 1 GB
        </p>
        <input
          ref={inputRef}
          id={`${id}-files`}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.zip,application/zip"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={reading || busy}
          onClick={() => inputRef.current?.click()}
          className={SECONDARY_BUTTON}
        >
          {reading ? "กำลังอ่านไฟล์…" : "เลือกไฟล์รูป / .zip"}
        </button>
      </div>

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm leading-[1.4] text-text-2">
              {items.length} หน้าใหม่ · {(items.reduce((t, i) => t + i.file.size, 0) / 1024 / 1024).toFixed(1)} MB
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setItems((p) => [...p].sort((a, b) => collator.compare(a.name, b.name)))}
                className={TEXT_BUTTON}
              >
                เรียงตามชื่อไฟล์
              </button>
              <button type="button" disabled={busy} onClick={clear} className={`${TEXT_BUTTON} hover:text-hot`}>
                ล้างทั้งหมด
              </button>
            </div>
          </div>
          <ol className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {items.map((item, i) => (
              <li key={item.key} className="flex flex-col gap-1.5">
                <div className="relative overflow-hidden rounded-xl bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img src={item.url} alt={`หน้า ${i + 1}`} className="aspect-[3/4] w-full object-cover object-top" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
                    {i + 1}
                  </span>
                </div>
                <p className="truncate text-[11px] leading-[1.4] text-faint" title={item.name}>
                  {item.name}
                </p>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={`ย้ายหน้า ${i + 1} ขึ้น`}
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    className={`${TEXT_BUTTON} disabled:opacity-30`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`ลบหน้า ${i + 1}`}
                    disabled={busy}
                    onClick={() => remove(i)}
                    className={`${TEXT_BUTTON} hover:text-hot`}
                  >
                    ลบ
                  </button>
                  <button
                    type="button"
                    aria-label={`ย้ายหน้า ${i + 1} ลง`}
                    disabled={busy || i === items.length - 1}
                    onClick={() => move(i, 1)}
                    className={`${TEXT_BUTTON} disabled:opacity-30`}
                  >
                    →
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3">
            <div>
              <button type="button" disabled={busy || reading} onClick={() => void save()} className={PRIMARY_BUTTON}>
                {busy ? "กำลังอัพโหลด…" : savedCount > 0 ? `แทนที่ด้วย ${items.length} หน้านี้` : `อัพโหลด ${items.length} หน้า`}
              </button>
            </div>
            {progress && <UploadProgress progress={progress} />}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={SUCCESS_BOX}>
          {notice}
        </p>
      )}
    </div>
  );
}

function UploadProgress({ progress }: { progress: Progress }) {
  const percent = progress.phase === "save" ? 100 : Math.round((progress.done / progress.total) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label="ความคืบหน้าการอัพโหลด"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p aria-live="polite" className="text-[13px] leading-[1.4] text-muted">
        {progress.phase === "save"
          ? "กำลังตรวจไฟล์และบันทึก…"
          : `อัพโหลดแล้ว ${progress.done}/${progress.total} หน้า — อย่าเพิ่งปิดหน้านี้`}
      </p>
    </div>
  );
}
