import { coverUrl } from "@/lib/r2/shared";
import type { CoverBadge } from "@/lib/server/home";
import { CoinIcon } from "./icons";

// Series cover: the image from the public R2 bucket when the series has one,
// else the design's gradient placeholder with the title's first consonant.

const GRADIENTS = [
  "from-[#c04cfd] via-[#3b1e7a] via-70% to-[#0e0e14]",
  "from-[#ff8fb1] via-[#7a2c5b] via-70% to-[#0e0e14]",
  "from-[#5ec8ff] via-[#1f3f7a] via-70% to-[#0e0e14]",
  "from-[#ffc46b] via-[#7a4a1e] via-70% to-[#0e0e14]",
  "from-[#6bffc4] via-[#1e6b5a] via-70% to-[#0e0e14]",
];

// Thai leading vowels (เ แ โ ใ ไ) come before the consonant: "เชฟ" → "ช".
const LEADING_VOWEL = /^[เ-ไ]/;

export function coverInitial(title: string) {
  const chars = [...title.trim()];
  return (LEADING_VOWEL.test(chars[0] ?? "") ? chars[1] : chars[0]) ?? "";
}

export function Cover({
  id,
  title,
  className = "",
  initialClassName = "text-[20px] left-2.5 bottom-2.5",
  badge,
  coverKey,
  priority = false,
}: {
  id: number;
  title: string;
  coverKey?: string | null;
  /** Above the fold (hero): load right away instead of lazily. */
  priority?: boolean;
  className?: string;
  initialClassName?: string;
  badge?: CoverBadge;
}) {
  const src = coverUrl(coverKey);
  if (src) {
    return (
      <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- resized webp from R2, immutable key */}
        <img
          src={src}
          alt={`ปก ${title}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
        {badge && <Badge badge={badge} />}
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden bg-linear-to-b ${GRADIENTS[id % GRADIENTS.length]} ${className}`}
      role="img"
      aria-label={`ปก ${title}`}
    >
      <span aria-hidden="true" className={`absolute font-bold leading-none text-white/40 ${initialClassName}`}>
        {coverInitial(title)}
      </span>
      {badge && <Badge badge={badge} />}
    </div>
  );
}

function Badge({ badge }: { badge: CoverBadge }) {
  const base = "absolute left-2 top-2 flex h-[19px] items-center gap-1 rounded-md px-2 text-[11px] font-bold leading-none";
  if (badge.kind === "up") return <span className={`${base} bg-hot text-white`}>UP</span>;
  if (badge.kind === "free") return <span className={`${base} bg-free text-white`}>ฟรี</span>;
  return (
    <span className={`${base} bg-black/60 text-gold`}>
      <CoinIcon size={12} />
      {badge.price}
      <span className="sr-only">coin</span>
    </span>
  );
}
