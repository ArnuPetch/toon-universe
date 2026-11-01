import type { EpisodeItem, SeriesDetail, ViewerState } from "@/lib/server/series";
import { countComments, getMyReview, getReviewSummary, loadComments, loadReviews, type Target } from "@/lib/server/social";
import { SectionSkeleton } from "../section";
import { CommentPanel } from "./comment-panel";
import { DiscussionTabs } from "./discussion-tabs";
import { ReviewPanel } from "./review-panel";

// Server parts of reviews + comments: load everything for the target in
// parallel, then hand plain data to the client panels. Personal (own review,
// isOwn flags) → never cached; render inside <Suspense>.

async function loadAll(target: Target) {
  const [summary, myReview, reviews, comments, commentCount] = await Promise.all([
    getReviewSummary(target),
    getMyReview(target),
    loadReviews(target),
    loadComments(target),
    countComments(target),
  ]);
  return { summary, myReview, reviews, comments, commentCount };
}

/** Series page: reviews (default) + series-level comments. */
export async function SeriesDiscussion({ series, viewer }: { series: SeriesDetail; viewer: ViewerState }) {
  const target = { seriesId: series.id, episodeId: null };
  const d = await loadAll(target);
  const loginHref = `/login?next=${encodeURIComponent(`/series/${series.slug}#comments`)}`;
  const hasRead = viewer.progress != null || viewer.unlocks.size > 0;
  const blockedReason = viewer.isOwner
    ? "นี่คือผลงานของคุณ — รีวิวผลงานตัวเองไม่ได้"
    : !hasRead
      ? "อ่านอย่างน้อย 1 ตอนก่อน แล้วกลับมาให้คะแนนเรื่องนี้นะ"
      : null;

  return (
    <DiscussionTabs
      title="รีวิวและความคิดเห็น"
      tabs={[
        {
          key: "reviews",
          label: "รีวิว",
          count: d.summary.count,
          panel: (
            <ReviewPanel
              target={target}
              summary={d.summary}
              myReview={d.myReview}
              initial={d.reviews}
              viewer={{ userId: viewer.userId, loginHref, blockedReason }}
              uploaderId={series.uploader?.id ?? null}
              now={viewer.now}
            />
          ),
        },
        {
          key: "comments",
          label: "ความคิดเห็น",
          count: d.commentCount,
          panel: (
            <CommentPanel
              target={target}
              initial={d.comments}
              viewerId={viewer.userId}
              loginHref={loginHref}
              uploaderId={series.uploader?.id ?? null}
              now={viewer.now}
            />
          ),
        },
      ]}
    />
  );
}

/** Reader: comments on this episode (default) + rate this episode. */
export async function EpisodeDiscussion({
  series,
  episode,
  viewer,
  canRead,
}: {
  series: SeriesDetail;
  episode: EpisodeItem;
  viewer: ViewerState;
  canRead: boolean;
}) {
  const target = { seriesId: series.id, episodeId: episode.id };
  const d = await loadAll(target);
  const loginHref = `/login?next=${encodeURIComponent(`/series/${series.slug}/${episode.number}#comments`)}`;
  const blockedReason = viewer.isOwner
    ? "นี่คือผลงานของคุณ — ให้คะแนนตอนของตัวเองไม่ได้"
    : !canRead
      ? "ปลดล็อกตอนนี้ก่อน แล้วค่อยให้คะแนนนะ"
      : null;

  return (
    <DiscussionTabs
      title={`ตอนที่ ${episode.number}`}
      tabs={[
        {
          key: "comments",
          label: "ความคิดเห็น",
          count: d.commentCount,
          panel: (
            <CommentPanel
              target={target}
              initial={d.comments}
              viewerId={viewer.userId}
              loginHref={loginHref}
              uploaderId={series.uploader?.id ?? null}
              now={viewer.now}
            />
          ),
        },
        {
          key: "reviews",
          label: "ให้คะแนน",
          count: d.summary.count,
          panel: (
            <ReviewPanel
              compact
              target={target}
              summary={d.summary}
              myReview={d.myReview}
              initial={d.reviews}
              viewer={{ userId: viewer.userId, loginHref, blockedReason }}
              uploaderId={series.uploader?.id ?? null}
              now={viewer.now}
            />
          ),
        },
      ]}
    />
  );
}

export function DiscussionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SectionSkeleton className="h-8 w-56" />
      <SectionSkeleton className="h-[320px]" />
    </div>
  );
}
