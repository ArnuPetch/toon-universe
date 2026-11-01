"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { saveEpisodePages } from "@/app/actions/studio";
import { ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON, SUCCESS_BOX, TEXT_BUTTON } from "../form-styles";

// Pick many images (or drop them), sorted by file name like a file manager
// ("2.jpg" before "10.jpg"), reorder, then save.
//
// TODO(R2): images aren't uploaded yet — only the order + width/height are
// saved (saveEpisodePages). Upload each file with a presigned PUT here first,
// and add .zip support (unzip in the browser) at the same time.

type Item = { key: string; name: string; url: string; width: number; height: number; ext: string; size: number };

const MAX_PAGES = 300;
const MAX_BYTES = 20 * 1024 * 1024;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

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
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const id = useId();

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Free the preview object URLs when leaving the page.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  async function addFiles(list: FileList | File[]) {
    setError(null);
    setNotice(null);
    const files = [...list];
    const skipped: string[] = [];
    const images = files.filter((f) => {
      const ok = f.type in EXT && f.size <= MAX_BYTES;
      if (!ok) skipped.push(f.name);
      return ok;
    });
    if (images.length === 0) {
      setError("เลือกไฟล์รูป JPG, PNG, WebP, GIF หรือ AVIF (ไม่เกิน 20 MB ต่อรูป)");
      return;
    }
    setReading(true);
    const read = await Promise.all(
      images.map(async (f): Promise<Item | null> => {
        const url = URL.createObjectURL(f);
        try {
          const { width, height } = await readSize(url);
          return { key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`, name: f.name, url, width, height, ext: EXT[f.type], size: f.size };
        } catch {
          URL.revokeObjectURL(url);
          skipped.push(f.name);
          return null;
        }
      }),
    );
    setReading(false);
    const added = read.filter((x): x is Item => x !== null);
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

  function save() {
    if (savedCount > 0 && !confirm(`แทนที่ ${savedCount} หน้าเดิมด้วย ${items.length} หน้าใหม่?`)) return;
    setError(null);
    start(async () => {
      const r = await saveEpisodePages(
        seriesId,
        episodeId,
        items.map(({ width, height, ext }) => ({ width, height, ext })),
      );
      if (!r.ok) {
        setError(r.message);
        return;
      }
      clear();
      setNotice(`บันทึก ${r.data.count} หน้าแล้ว`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-gold/10 px-4 py-3 text-[13px] leading-[1.5] text-gold">
        ช่วงทดสอบ: ยังไม่ได้เชื่อมที่เก็บรูป ระบบบันทึกเฉพาะลำดับและขนาดหน้า (หน้าอ่านจะแสดงกรอบแทนรูป)
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-[20px] border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary/10" : "border-line bg-surface-2"
        }`}
      >
        <p className="text-[15px] font-semibold leading-[1.4]">ลากรูปมาวางที่นี่</p>
        <p className="text-[13px] leading-[1.5] text-muted">
          เลือกได้หลายไฟล์พร้อมกัน ระบบเรียงตามชื่อไฟล์ให้ (1, 2, … 10) · ไม่เกิน {MAX_PAGES} หน้า, 20 MB ต่อรูป
        </p>
        <input
          ref={inputRef}
          id={`${id}-files`}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} className={SECONDARY_BUTTON}>
          {reading ? "กำลังอ่านไฟล์…" : "เลือกไฟล์รูป"}
        </button>
      </div>

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm leading-[1.4] text-text-2">
              {items.length} หน้าใหม่ · {(items.reduce((t, i) => t + i.size, 0) / 1024 / 1024).toFixed(1)} MB
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setItems((p) => [...p].sort((a, b) => collator.compare(a.name, b.name)))}
                className={TEXT_BUTTON}
              >
                เรียงตามชื่อไฟล์
              </button>
              <button type="button" onClick={clear} className={`${TEXT_BUTTON} hover:text-hot`}>
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
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className={`${TEXT_BUTTON} disabled:opacity-30`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`ลบหน้า ${i + 1}`}
                    onClick={() => remove(i)}
                    className={`${TEXT_BUTTON} hover:text-hot`}
                  >
                    ลบ
                  </button>
                  <button
                    type="button"
                    aria-label={`ย้ายหน้า ${i + 1} ลง`}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                    className={`${TEXT_BUTTON} disabled:opacity-30`}
                  >
                    →
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <button type="button" disabled={pending} onClick={save} className={PRIMARY_BUTTON}>
              {pending ? "กำลังบันทึก…" : savedCount > 0 ? `แทนที่ด้วย ${items.length} หน้านี้` : `บันทึก ${items.length} หน้า`}
            </button>
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
