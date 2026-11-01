"use client";

import { useState, useTransition } from "react";
import { deleteComment, editComment, loadMoreComments, postComment } from "@/app/actions/social";
import type { CommentItem, Target } from "@/lib/server/social";
import { ERROR_BOX, SECONDARY_BUTTON, TEXT_BUTTON } from "../form-styles";
import { timeAgo } from "../format";
import { AuthorLine, Composer, ReportButton, SignInToWrite, SpoilerText } from "./bits";

const MAX_COMMENT = 2000;
const REPLIES_SHOWN = 3;

type Ctx = {
  target: Target;
  viewerId: string | null;
  uploaderId: string | null;
  now: number;
  update: (id: number, fn: (c: CommentItem) => CommentItem | null) => void;
};

/** Comment composer + newest-first thread list (one level of replies). */
export function CommentPanel({
  target,
  initial,
  viewerId,
  loginHref,
  uploaderId,
  now,
}: {
  target: Target;
  initial: { items: CommentItem[]; hasMore: boolean };
  viewerId: string | null;
  loginHref: string;
  uploaderId: string | null;
  now: number;
}) {
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, startLoading] = useTransition();

  // Apply fn to a comment or reply by id; returning null removes it.
  const update: Ctx["update"] = (id, fn) =>
    setItems((cur) =>
      cur.flatMap((c) => {
        if (c.id === id) {
          const next = fn(c);
          return next ? [next] : [];
        }
        if (!c.replies.some((r) => r.id === id)) return [c];
        return [{ ...c, replies: c.replies.flatMap((r) => (r.id === id ? (fn(r) ?? []) : [r])) }];
      }),
    );

  const ctx: Ctx = { target, viewerId, uploaderId, now, update };

  const more = () =>
    startLoading(async () => {
      const r = await loadMoreComments(target, items[items.length - 1].id);
      setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setHasMore(r.hasMore);
    });

  return (
    <div className="flex flex-col gap-5">
      {viewerId ? (
        <Composer
          label="เขียนความคิดเห็น"
          placeholder={target.episodeId == null ? "คิดยังไงกับเรื่องนี้บ้าง?" : "คิดยังไงกับตอนนี้บ้าง?"}
          submitLabel="ส่ง"
          max={MAX_COMMENT}
          onSubmit={async (body, isSpoiler) => {
            const r = await postComment({ target, parentId: null, body, isSpoiler });
            if (!r.ok) return r.message;
            setItems((cur) => [r.data, ...cur]);
            return null;
          }}
        />
      ) : (
        <SignInToWrite href={loginHref} text="เข้าสู่ระบบเพื่อร่วมแสดงความคิดเห็น" />
      )}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id}>
              <Thread comment={c} ctx={ctx} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-muted">
          ยังไม่มีความคิดเห็น — เริ่มคุยเป็นคนแรกเลย
        </p>
      )}
      {hasMore && (
        <button type="button" onClick={more} disabled={loading} className={`${SECONDARY_BUTTON} self-center`}>
          {loading ? "กำลังโหลด…" : "ดูความคิดเห็นเพิ่มเติม"}
        </button>
      )}
    </div>
  );
}

function Thread({ comment, ctx }: { comment: CommentItem; ctx: Ctx }) {
  const [replying, setReplying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const replies = showAll ? comment.replies : comment.replies.slice(0, REPLIES_SHOWN);
  const hiddenCount = comment.replies.length - replies.length;

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <CommentBody comment={comment} ctx={ctx} onReply={ctx.viewerId && !comment.hidden ? () => setReplying((v) => !v) : undefined} />

      {(replies.length > 0 || replying) && (
        <div className="ml-1 flex flex-col gap-3 border-l-2 border-line pl-3.5 lg:ml-2 lg:pl-5">
          {replies.map((r) => (
            <CommentBody key={r.id} comment={r} ctx={ctx} />
          ))}
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className={`${TEXT_BUTTON} self-start text-primary`}>
              ดูคำตอบอีก {hiddenCount} รายการ
            </button>
          )}
          {replying && (
            <Composer
              autoFocus
              label={`ตอบกลับ ${comment.author.name}`}
              placeholder={`ตอบกลับ ${comment.author.name}`}
              submitLabel="ตอบกลับ"
              max={MAX_COMMENT}
              onCancel={() => setReplying(false)}
              onSubmit={async (body, isSpoiler) => {
                const r = await postComment({ target: ctx.target, parentId: comment.id, body, isSpoiler });
                if (!r.ok) return r.message;
                ctx.update(comment.id, (c) => ({ ...c, replies: [...c.replies, r.data] }));
                setShowAll(true);
                setReplying(false);
                return null;
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}

function CommentBody({ comment, ctx, onReply }: { comment: CommentItem; ctx: Ctx; onReply?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOwn = comment.authorId === ctx.viewerId;

  const remove = () => {
    if (!confirm("ลบความคิดเห็นนี้?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteComment(comment.id);
      if (!r.ok) return setError(r.message);
      ctx.update(comment.id, () => null);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <AuthorLine
        author={comment.author}
        isUploader={comment.authorId === ctx.uploaderId}
        isOwn={isOwn}
        meta={`${timeAgo(comment.createdAt, ctx.now)}${comment.edited ? " · แก้ไขแล้ว" : ""}`}
      />
      {comment.hidden && (
        <p className="rounded-xl bg-hot/10 px-3 py-2 text-[13px] text-hot">
          ความคิดเห็นนี้ถูกซ่อนโดยผู้ดูแล — คนอื่นมองไม่เห็น
        </p>
      )}
      {editing ? (
        <Composer
          autoFocus
          label="แก้ไขความคิดเห็น"
          placeholder="แก้ไขความคิดเห็น"
          initialBody={comment.body}
          initialSpoiler={comment.isSpoiler}
          submitLabel="บันทึก"
          max={MAX_COMMENT}
          onCancel={() => setEditing(false)}
          onSubmit={async (body, isSpoiler) => {
            const r = await editComment(comment.id, body, isSpoiler);
            if (!r.ok) return r.message;
            ctx.update(comment.id, (c) => ({ ...r.data, replies: c.replies }));
            setEditing(false);
            return null;
          }}
        />
      ) : (
        <SpoilerText text={comment.body} spoiler={comment.isSpoiler} />
      )}
      {!editing && ctx.viewerId && (
        <div className="-ml-1 flex flex-wrap gap-2">
          {onReply && (
            <button type="button" onClick={onReply} className={TEXT_BUTTON}>
              ตอบกลับ
            </button>
          )}
          {isOwn ? (
            <>
              {!comment.hidden && (
                <button type="button" onClick={() => setEditing(true)} disabled={pending} className={TEXT_BUTTON}>
                  แก้ไข
                </button>
              )}
              <button type="button" onClick={remove} disabled={pending} className={TEXT_BUTTON}>
                ลบ
              </button>
            </>
          ) : (
            <ReportButton kind="comment" id={comment.id} />
          )}
        </div>
      )}
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
    </div>
  );
}
