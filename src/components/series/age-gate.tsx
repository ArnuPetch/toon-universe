import Link from "next/link";
import type { AgeRating } from "@/lib/server/series";
import { AGE_RATING_YEARS } from "../format";
import { LockIcon } from "../icons";

/** Shown instead of "read" buttons / pages when the viewer is too young or unknown age. */
export function AgeGate({
  slug,
  ageRating,
  signedIn,
  className = "",
}: {
  slug: string;
  ageRating: AgeRating;
  signedIn: boolean;
  className?: string;
}) {
  return (
    <div className={`flex w-full max-w-[560px] flex-col items-start gap-3 rounded-xl bg-bg/60 p-4 ${className}`}>
      <p className="flex items-center gap-2 text-[15px] font-semibold leading-[1.4]">
        <LockIcon size={18} className="text-hot" />
        เนื้อหาสำหรับผู้มีอายุ {AGE_RATING_YEARS[ageRating]} ปีขึ้นไป
      </p>
      <p className="text-sm leading-[1.5] text-muted">
        {signedIn
          ? "กรอกวันเกิดในหน้าโปรไฟล์เพื่อยืนยันอายุก่อนอ่านเรื่องนี้"
          : "เข้าสู่ระบบและกรอกวันเกิดเพื่อยืนยันอายุก่อนอ่านเรื่องนี้"}
      </p>
      <Link
        href={signedIn ? "/profile" : `/login?next=${encodeURIComponent(`/series/${slug}`)}`}
        className="flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        {signedIn ? "ไปที่โปรไฟล์" : "เข้าสู่ระบบ"}
      </Link>
    </div>
  );
}
