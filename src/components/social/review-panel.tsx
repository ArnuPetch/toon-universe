"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteReview, loadMoreReviews, saveReview } from "@/app/actions/social";
import type { ReviewItem, ReviewSummary, Target } from "@/lib/server/social";
import { ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXTAREA, TEXT_BUTTON } from "../form-styles";
import { timeAgo } from "../format";
import { StarIcon } from "../icons";
import { AuthorLine, ReportButton, SignInToWrite, SpoilerCheckbox, SpoilerText, StarInput, Stars } from "./bits";

const MAX_REVIEW = 5000;

export type ReviewViewer = {
  userId: string | null;
  loginHref: string;
  /** null = may review; otherwise why not (shown instead of the form). */
  blockedReason: string | null;
};

/** Rating summary + the viewer's own review + newest written reviews. */
export function ReviewPanel({
  target,
  summary,
  myReview,
  initial,
  viewer,
  uploaderId,
  now,
  compact,
}: {
  target: Target;
  summary: ReviewSummary;
  myReview: ReviewItem | null;
  initial: { items: ReviewItem[]; hasMore: boolean };
  viewer: ReviewViewer;
  uploaderId: string | null;
  now: number;
  /** Episode page: smaller summary, no histogram. */
  compact?: boolean;
}) {
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, startLoading] = useTransition();

  const more = () =>
    startLoading(async () => {
      const r = await loadMoreReviews(target, items[items.length - 1].id);
      setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setHasMore(r.hasMore);
    });

  return (
    <div className="flex flex-col gap-5">
      <div className={`flex flex-col gap-5 ${compact ? "" : "lg:flex-row lg:items-start lg:gap-8"}`}>
        <SummaryCard summary={summary} compact={compact} />
        <div className="min-w-0 flex-1">
          {viewer.userId == null ? (
            <SignInToWrite href={viewer.loginHref} text="เข้าสู่ระบบเพื่อให้คะแนนและเขียนรีวิว" />
          ) : viewer.blockedReason && !myReview ? (
            <p className="rounded-2xl bg-surface px-4 py-3.5 text-sm leading-[1.4] text-muted">{viewer.blockedReason}</p>
          ) : (
            <MyReview key={myReview?.id ?? "new"} target={target} review={myReview} now={now} compact={compact} />
          )}
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((r) => (
            <li key={r.id}>
              <ReviewCard review={r} isUploader={r.authorId === uploaderId} viewerId={viewer.userId} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        !compact && (
          <p className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-muted">
            ยังไม่มีรีวิว — มาเป็นคนแรกที่เขียนรีวิวเรื่องนี้
          </p>
        )
      )}
      {hasMore && (
        <button type="button" onClick={more} disabled={loading} className={`${SECONDARY_BUTTON} self-center`}>
          {loading ? "กำลังโหลด…" : "ดูรีวิวเพิ่มเติม"}
        </button>
      )}
    </div>
  );
}

function SummaryCard({ summary, compact }: { summary: ReviewSummary; compact?: boolean }) {
  const max = Math.max(1, ...summary.stars);
  return (
    <div
      className={`flex shrink-0 items-center gap-5 rounded-2xl bg-surface p-4 ${compact ? "" : "lg:w-[340px] lg:p-5"}`}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <p className="text-[36px] font-bold leading-none">{summary.avg != null ? summary.avg.toFixed(1) : "–"}</p>
        <Stars value={summary.avg ?? 0} />
        <p className="text-[12px] text-muted">{summary.count.toLocaleString("th-TH")} คะแนน</p>
      </div>
      {!compact && (
        <ul className="flex min-w-0 flex-1 flex-col gap-1" aria-label="จำนวนคะแนนแยกตามดาว">
          {[5, 4, 3, 2, 1].map((n) => (
            <li key={n} className="flex items-center gap-2 text-[12px] text-muted">
              <span className="flex w-6 shrink-0 items-center gap-0.5">
                {n}
                <StarIcon size={10} className="text-gold" />
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <span className="block h-full rounded-full bg-gold" style={{ width: `${(summary.stars[n - 1] / max) * 100}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right">
                <span className="sr-only">{n} ดาว </span>
                {summary.stars[n - 1].toLocaleString("th-TH")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyReview({
  target,
  review,
  now,
  compact,
}: {
  target: Target;
  review: ReviewItem | null;
  now: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(review);
  const [editing, setEditing] = useState(review == null);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [body, setBody] = useState(review?.body ?? "");
  const [spoiler, setSpoiler] = useState(review?.isSpoiler ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = target.episodeId == null ? "เรื่องนี้" : "ตอนนี้";

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return setError("เลือกจำนวนดาวก่อนนะ");
    setError(null);
    startTransition(async () => {
      const r = await saveReview({ target, rating, body, isSpoiler: spoiler });
      if (!r.ok) return setError(r.message);
      setSaved(r.data);
      setEditing(false);
      router.refresh(); // header rating + summary
    });
  };

  const remove = () => {
    if (!saved || !confirm("ลบรีวิวของคุณ?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteReview(saved.id);
      if (!r.ok) return setError(r.message);
      setSaved(null);
      setRating(0);
      setBody("");
      setSpoiler(false);
      setEditing(true);
      router.refresh();
    });
  };

  if (saved && !editing) {
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-text-2">รีวิวของคุณ</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} disabled={pending} className={TEXT_BUTTON}>
              แก้ไข
            </button>
            <button type="button" onClick={remove} disabled={pending} className={TEXT_BUTTON}>
              ลบ
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-faint">
          <Stars value={saved.rating} size={16} />· {timeAgo(saved.createdAt, now)}
        </div>
        {saved.hidden && (
          <p className="rounded-xl bg-hot/10 px-3 py-2 text-[13px] text-hot">
            รีวิวนี้ถูกซ่อนโดยผู้ดูแล — คนอื่นมองไม่เห็นและไม่นับคะแนน
          </p>
        )}
        {saved.body && <SpoilerText text={saved.body} spoiler={saved.isSpoiler} />}
        {error && (
          <p role="alert" className={ERROR_BOX}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <p className="text-sm font-semibold text-text-2">
        {saved ? "แก้ไขรีวิวของคุณ" : `ให้คะแนน${what}`}
      </p>
      <StarInput
        name={`rating-${target.seriesId}-${target.episodeId ?? "s"}`}
        value={rating}
        onChange={setRating}
        disabled={pending}
        size={compact ? 28 : 32}
      />
      <textarea
        aria-label="เขียนรีวิว (ไม่บังคับ)"
        placeholder={`เล่าให้คนอื่นฟังหน่อยว่า${what}เป็นยังไง (ไม่บังคับ)`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_REVIEW}
        disabled={pending}
        className={TEXTAREA}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SpoilerCheckbox checked={spoiler} onChange={setSpoiler} disabled={pending || !body.trim()} />
        <div className="flex gap-2">
          {saved && (
            <button type="button" onClick={() => setEditing(false)} disabled={pending} className={SECONDARY_BUTTON}>
              ยกเลิก
            </button>
          )}
          <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} h-10 px-5 text-sm`}>
            {pending ? "กำลังบันทึก…" : saved ? "บันทึก" : "ส่งรีวิว"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
    </form>
  );
}

function ReviewCard({
  review,
  isUploader,
  viewerId,
  now,
}: {
  review: ReviewItem;
  isUploader: boolean;
  viewerId: string | null;
  now: number;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <AuthorLine
            author={review.author}
            isUploader={isUploader}
            isOwn={false}
            meta={`${timeAgo(review.createdAt, now)}${review.edited ? " · แก้ไขแล้ว" : ""}`}
          />
          <Stars value={review.rating} />
        </div>
        {viewerId && <ReportButton kind="review" id={review.id} />}
      </div>
      {review.body && <SpoilerText text={review.body} spoiler={review.isSpoiler} />}
    </article>
  );
}
