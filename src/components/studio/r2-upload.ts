// Browser side of the R2 uploads: PUT files to presigned URLs, unzip .zip
// chapters, resize covers. Server side: prepare*/save* in app/actions/studio.ts.

import type { PresignedPut } from "@/app/actions/studio";
import { MAX_PAGE_BYTES, PAGE_TYPES } from "@/lib/r2/shared";

const CONCURRENCY = 4;

/** PUT every file to its presigned URL (retried once). Calls onProgress after each. */
export async function putAll(files: Blob[], uploads: PresignedPut[], onProgress: (done: number) => void) {
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < files.length) {
      const i = next++;
      await putOne(files[i], uploads[i]);
      onProgress(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
}

async function putOne(file: Blob, upload: PresignedPut) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: file });
      if (res.ok) return;
      if (res.status < 500 || attempt >= 1) throw new Error(`upload ${res.status}`);
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
}

const EXT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(PAGE_TYPES).map(([type, ext]) => [ext, type]),
);
EXT_TYPE.jpeg = "image/jpeg";

export const MAX_ZIP_BYTES = 1024 * 1024 * 1024;

/**
 * Images inside a .zip as Files named by their path in the archive (so
 * "ch1/02.jpg" sorts before "ch1/10.jpg"). Skips macOS metadata / hidden files.
 * `skipped` gets the names of entries that aren't usable images.
 */
export async function unzipImages(zip: File, skipped: string[]): Promise<File[]> {
  const { unzip } = await import("fflate");
  const data = new Uint8Array(await zip.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(
      data,
      {
        filter: (f) => {
          const base = f.name.split("/").pop() ?? "";
          if (f.name.endsWith("/") || f.name.startsWith("__MACOSX/") || base.startsWith(".")) return false;
          const ext = base.split(".").pop()?.toLowerCase() ?? "";
          if (!(ext in EXT_TYPE) || f.originalSize > MAX_PAGE_BYTES) {
            skipped.push(f.name);
            return false;
          }
          return true;
        },
      },
      (err, out) => (err ? reject(err) : resolve(out)),
    ),
  );
  return Object.entries(entries).map(([name, bytes]) => {
    const ext = name.split(".").pop()!.toLowerCase();
    return new File([bytes as Uint8Array<ArrayBuffer>], name, { type: EXT_TYPE[ext] });
  });
}

/**
 * Cover → max 720×960 (3:4 cards show it at most ~260px wide, 2–3× for
 * retina), WebP (JPEG where the browser can't encode WebP, e.g. older Safari).
 */
export async function resizeCover(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 720 / bitmap.width, 960 / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode");
  return jpeg;
}
