# Database (Supabase / Postgres)

## Migrations

- ใช้ imperative migrations ใน `supabase/migrations/` (ไม่ใช้ declarative schemas)
- Supabase GitHub integration ผูกกับ branch `dev`: push migration ไปที่ `dev` แล้ว integration จะ apply ให้เอง
- แก้ schema แล้วต้องรัน `npm run db:types` ใหม่ทุกครั้ง (→ `src/lib/supabase/database.types.ts`)

| ไฟล์ | เนื้อหา |
|---|---|
| `20261101081833_init_schema.sql` | Schema ต้นแบบ, RLS, triggers, helper functions |
| `20261101085756_server_functions.sql` | Server-side functions (RPC) |
| `20261101120000_coin_checkout.sql` | เติม coin ผ่าน Stripe Checkout (PromptPay) |
| `20261101130000_cron_jobs.sql` | Cron jobs (pg_cron) |
| `20261101140000_ranking.sql` | นับยอดวิว, ranking, recommendation |
| `20261101150000_series_page.sql` | `get_series_stats` (สถิติทั้งหมดของเรื่องจาก MV), `viewer_meets_age_rating` (ผู้เรียกผ่านเรตไหม) — anon/authenticated เรียกได้, security invoker |
| `20261101160000_reader_pages.sql` | `search_series` — ค้นหา/กรองเรื่องสาธารณะที่ผู้เรียกเห็นได้ (RLS + เรตอายุ): ข้อความ (ชื่อเรื่อง/ผู้เขียน/ชื่อแนว, `ILIKE` escape wildcard แล้ว), แนว, สถานะ, ฟรี (ไม่มีตอนเสียเงินที่ปล่อยแล้ว) / เสียเงิน, เรียง `relevance`/`popular` (วิวเดือนนี้)/`updated`/`new`/`rating`/`title`; คืนตอนล่าสุด + `total_count`; limit ≤ 60, offset ≤ 10000 — anon/authenticated, security invoker |
| `20261101170000_birth_date_lock.sql` | trigger `lock_birth_date` บน `user_private_info`: ผู้ใช้ (anon/authenticated) ตั้งวันเกิดได้ครั้งเดียวตอนยังเป็น null — แก้/ลบหลังจากนั้น → `birth_date_locked`; `service_role` (ฝ่าย support/admin) แก้ได้ |
| `20261101180000_comments_reviews.sql` | กฎเขียนคอมเมนต์/รีวิว (trigger, ข้ามเมื่อเป็น `service_role`), แจ้งเตือน `comment_reply`, ซ่อนคอมเมนต์/รีวิวของคนที่โดนแบน, report ซ้ำไม่ได้, RPC `get_review_summary` — ดู [คอมเมนต์ + รีวิว](#คอมเมนต์--รีวิว-comments_reviews) |
| `20261102090000_studio_admin.sql` | หน้า Uploader/Admin — ดู [Studio + Admin](#studio--admin-studio_admin) |

## Schema ต้นแบบ (`init_schema`)

- ผ่าน `supabase db advisors` แล้ว และทดสอบ RLS/trigger กับ local Supabase (Docker) แล้ว
- RLS เปิดทุกตาราง; ถอน default grants แล้วให้สิทธิ์ทีละตาราง/คอลัมน์
- **Client อ่านข้อมูลการเงินได้เฉพาะของตัวเอง เขียนไม่ได้** — unlock, donate, refund, withdrawal, ban, ชดเชย content hold ต้องทำฝั่ง server ด้วย `service_role`; งาน admin ก็ทำผ่าน server
- Helper functions อยู่ใน schema `private` (ไม่ expose ผ่าน API)

### Triggers

- สร้าง profile/wallet ตอนสมัคร
- Welcome coin 5 coin ตอนยืนยัน email (ครั้งเดียว)
- จำกัดการเปลี่ยนราคาตอนเดือนละครั้งหลังปล่อยตอน

## Server-side functions (`server_functions`)

- เป็น Postgres function (1 call = 1 transaction) ใน `public` แต่ **EXECUTE ให้เฉพาะ `service_role`** (anon/authenticated ได้ 42501); เป็น `security invoker`
- ส่ง id ผู้ใช้/admin เป็น parameter (`p_user_id`, `p_admin_id`) — **server ต้องเอาจาก session ที่ verify แล้ว (`getClaims()`) ห้ามรับจาก request body**; ฟังก์ชัน admin เช็ค `app_metadata.role = 'admin'` ซ้ำใน DB
- Error: SQLSTATE `P0001` + message เป็นรหัส เช่น `insufficient_coins`, `not_admin`, `below_minimum_withdrawal` (server แปลงเป็นข้อความให้ผู้ใช้ — ดู [server-integration.md](server-integration.md))
- Lock order กัน deadlock: profiles → series → episodes → coin_wallets (wallet เรียงตาม user_id)
- Welcome coin หมดอายุถูกตัดแบบ lazy ตอนแตะ wallet (`private.lock_wallet`)

### รายการฟังก์ชัน

| กลุ่ม | ฟังก์ชัน |
|---|---|
| Reader | `unlock_episode`, `donate` |
| ลบผลงาน + refund | `remove_series`, `remove_episode` (soft delete) |
| ถอนเงิน | `request_withdrawal` → `review_withdrawal` (approve/reject) → `mark_withdrawal_paid` |
| Sanction | `suspend_user`, `ban_user`, `lift_sanction` |
| ปิดตรวจ | `start_content_hold`, `end_content_hold` (ชดเชยเวลาตอนปิด hold) |
| เติม coin | `create_coin_purchase`, `attach_checkout_session`, `complete_coin_purchase`, `fail_coin_purchase` (ดู [server-integration.md](server-integration.md#stripe-checkout-promptpay)) |

### การตัดสินใจที่เลือกไว้

- ถอนเงิน = ถอนยอดที่ถอนได้ทั้งหมดในครั้งเดียว (ไม่แบ่งยอด)
- Ban uploader → ซ่อนทุกเรื่อง (`moderation_status = 'removed'`), คืน coin เฉพาะรายได้ที่ยังถอนไม่ได้, รายได้ที่เหลือ + คำขอถอนที่ค้างถูกยึด
- รายได้จากเรื่องที่กำลังปิดตรวจถอนไม่ได้จนกว่าจะเปิด
- ปลด ban ไม่คืน coin/เรื่องที่ถูกยึด
- เติม coin:
  - `complete_coin_purchase` idempotent (webhook ซ้ำไม่เติมซ้ำ) และชนะสถานะ failed/canceled ที่มาก่อน (เงินเข้าแล้ว)
  - `fail_coin_purchase` แก้ได้เฉพาะ `pending` — ไม่ downgrade รายการที่สำเร็จแล้ว
  - หา purchase ด้วย id (`client_reference_id`) ไม่ใช่ session id — webhook มาก่อน attach ก็ยังเจอ; ถ้า attach แล้ว session id ต้องตรง
  - ตรวจยอด + สกุลเงิน (`thb`) กับราคา snapshot ทุกครั้ง
  - จ่ายสำเร็จหลังโดน ban → บันทึกการจ่าย + เติม แล้วยึดทันที (`ban_forfeit`) ให้ wallet ของคนโดน ban เป็น 0 เสมอ

### Schema ที่เพิ่มใน migration นี้

- `episodes.deleted_at`
- ห้ามเลื่อน `publish_at` ของตอนที่ปล่อยแล้ว
- Open content hold ได้ 1 อันต่อเรื่อง

## Cron jobs (`cron_jobs`)

ใช้ pg_cron ใน DB (ไม่ต้องมี server) — แต่ละ job เรียกฟังก์ชันใน `private` (EXECUTE เฉพาะ `service_role`)

| Job | ความถี่ | ฟังก์ชัน | ทำอะไร |
|---|---|---|---|
| `release-episodes` | ทุกนาที | `release_due_episodes` | ตอนที่ถึง `publish_at` → แจ้ง follower (`new_episode`) + อัพเดต `series.last_episode_at` |
| `refresh-suspensions` | ทุกนาที | `refresh_expired_suspensions` | suspend ที่ครบ `ends_at` → `refresh_user_status` |
| `expire-welcome-coins` | ทุก 10 นาที | `expire_welcome_coins` | ตัด welcome coin หมดอายุ + ลง ledger (เหมือน lazy expiry ใน `lock_wallet`) |
| `purge-cron-history` | ทุกวัน 03:00 UTC | — | ลบ `cron.job_run_details` เก่ากว่า 7 วัน |

- ทุกฟังก์ชันจำกัด batch + `SKIP LOCKED` — ไม่รอ/ไม่ deadlock กับ request ของผู้ใช้ ส่วนที่ข้ามไปจะทำรอบถัดไป; เคารพ lock order (profiles → series → episodes)
- `episodes.released_at` = job จัดการตอนนี้แล้ว (ตอนที่ปล่อยก่อน migration ถูก backfill = `publish_at`) — แจ้งครั้งเดียวต่อตอน
- แจ้ง follower เฉพาะตอนที่อ่านได้จริงตอนนั้น (series `published` + `active`, ไม่ถูกลบ); ถ้าไม่ใช่ → mark ว่าจัดการแล้วโดยไม่แจ้ง (เรื่องที่กลับมาจาก hold/draft จะไม่แจ้งตอนเก่ารวดเดียว); ไม่แจ้ง uploader เอง
- Ban ไม่มี `ends_at` จึงไม่ถูกปลดโดย cron (ถ้าจะมี ban แบบมีเวลา ต้องปลด Auth ban ฝั่ง server ด้วย)
- ดูผลการรัน: `select * from cron.job_run_details order by start_time desc`

## Ranking & recommendation (`ranking`)

| ส่วน | อยู่ที่ | ใครเรียก |
|---|---|---|
| นับวิว | `record_episode_view(p_episode_id, p_viewer_key)` → `episode_view_daily` | `service_role` เท่านั้น |
| Ranking | MV `private.series_rank_stats` + `get_series_ranking(kind, period, genre_id, limit, offset)` | anon / authenticated |
| คนที่อ่านเรื่องนี้ก็อ่าน | MV `private.series_also_read` + `get_series_recommendations(series_id, limit)` | anon / authenticated |

- **นับวิว**: 1 viewer / ตอน / วัน (วันตามเวลาไทย `Asia/Bangkok`); dedupe ด้วย `private.episode_view_seen` (เก็บ 2 วัน); ไม่นับ uploader ดูเอง, ตอนที่ยังไม่ปล่อย/ถูกลบ, เรื่องที่ไม่ public
  - `p_viewer_key` = user id จาก `getClaims()` หรือ `anon:<cookie tu_vid>` — server สร้างเอง ไม่รับจาก client
  - ข้อจำกัด: anon ลบ cookie แล้วปั๊มวิวได้ → ถ้าเจอปัญหาค่อยเพิ่ม rate limit ต่อ IP
- **Ranking kinds**: `views` (ยอดวิว), `rating` (Bayesian: บวกรีวิวเสมือน 5 อันที่ค่าเฉลี่ยของช่วงนั้น), `trending` (กิจกรรม = วิว + 10×ผู้ติดตามใหม่, เทียบกับช่วงก่อนหน้า, เฉพาะเรื่องที่โตขึ้น), `new` (เผยแพร่ครั้งแรกในช่วง), `updated` (มีตอนใหม่ในช่วง)
- **Periods**: `day` = วันนี้ + เมื่อวาน (bucket รายวัน — กันว่างตอนเที่ยงคืน), `week` = 7 วัน, `month` = 30 วัน, `all`; `trending` + `all` → ใช้ `month`
- `rating` นับเฉพาะรีวิวรายเรื่อง (`episode_id is null`) ที่ไม่ถูกซ่อน และเขียนในช่วงนั้น
- **Also read**: ผู้อ่าน "อ่าน" เรื่อง = มี reading_progress / follow / bookshelf (ไม่นับ `plan_to_read`); ใช้ 50 เรื่องล่าสุดต่อคน; cosine similarity; **คู่เรื่องต้องมีผู้อ่านร่วม ≥ 3 คน** (กันเปิดเผยประวัติการอ่านของคนใดคนหนึ่ง — PDPA); เก็บ top 30 ต่อเรื่อง; ไม่พอ → เติมด้วยเรื่องที่แนวตรงกันมากสุด (แล้วยอดวิวเดือนนี้)
- MV อยู่ใน `private` (ไม่ expose ผ่าน API, MV ใส่ RLS ไม่ได้); ฟังก์ชันเป็น `security invoker` join `public.series` → RLS + กรอง visibility + **เรตอายุของผู้เรียก** (ไม่ login = เห็นเฉพาะ `all`) ตอนอ่าน → เรื่องที่ถูกปิด/ลบหายทันทีไม่ต้องรอ refresh
- `new` / `updated` อ่านจาก `series` สด; `views` / `rating` / `trending` ช้าได้ ≤ 10 นาที
- `series.published_at` ตั้งโดย trigger ครั้งแรกที่ publish (ก่อนหน้านี้ไม่มีใครตั้ง → backfill = `created_at`)
- Cron: `refresh-rank-stats` ทุก 10 นาที, `refresh-also-read` ทุกชั่วโมง (นาทีที่ 17) — ใช้ `refresh ... concurrently` ไม่ block ผู้อ่าน; `purge-view-seen` ทุกวัน 03:10 UTC
- ถ้าข้อมูลโตมาก: `all` ของ `series_rank_stats` scan `episode_view_daily` ทั้งตาราง → ค่อยเพิ่มตารางยอดรวม; หรือย้าย refresh ไปเวลาที่คนน้อย

## คอมเมนต์ + รีวิว (`comments_reviews`)

Client เขียนตาราง `comments` / `reviews` / `reports` ตรงผ่าน RLS (`user_id` = session) — กฎที่เชื่อ client ไม่ได้อยู่ใน trigger:

- **คอมเมนต์** (รายเรื่อง `episode_id is null` / รายตอน): ตอนต้องปล่อยแล้ว + ไม่ถูกลบ (`episode_not_available`), ผ่านเรตอายุ (`age_restricted`, เจ้าของเรื่องข้าม), ตอบกลับได้ชั้นเดียว เฉพาะคอมเมนต์หลักที่ยังแสดงอยู่ของ target เดียวกัน (`comment_parent_invalid`), ≤ 5 คอมเมนต์/นาที (`rate_limited`)
- ลบคอมเมนต์ = soft delete ทางเดียว (`deleted_at` ถูกแทนด้วย `now()`); ลบแล้วแก้/กู้คืนไม่ได้ (`comment_not_found`); คอมเมนต์หลักที่ถูกลบ/ซ่อน → คำตอบใต้มันไม่แสดง (query ดึงคำตอบตาม parent ที่เห็น)
- ตอบกลับ → แจ้งเตือน `comment_reply` ให้เจ้าของคอมเมนต์หลัก (ไม่แจ้งตัวเอง; trigger security definer)
- **รีวิว**: 1 คน/target (unique), รีวิวเรื่องตัวเองไม่ได้ (`cannot_review_own_series`), เรตอายุ, ต้องเคยอ่าน (`review_requires_reading`) — รายเรื่อง: มี `reading_progress` หรือ unlock ในเรื่อง; รายตอน: ตอนฟรี หรือเคย unlock (หมดอายุแล้วก็นับ, refund ไม่นับ); แก้คะแนน/ข้อความได้ (ไม่เช็คซ้ำ), ลบได้
- อ่าน: นอกจาก hidden/deleted แล้ว ซ่อนของผู้ใช้ที่โดนแบนด้วย (policy เช็ค `profiles` ซึ่ง RLS ซ่อนคนโดนแบน) — **ยกเว้น MV ranking** (`series_rank_stats`) ซึ่งยังนับรีวิวของคนโดนแบน (ถ้าเป็นปัญหาให้ admin ซ่อนรีวิวตอนแบน)
- `get_review_summary(series_id, episode_id default null)` → ค่าเฉลี่ย, จำนวน, histogram 1–5 ดาว แบบสด (security invoker; ไม่นับ hidden แม้เป็นของตัวเอง) — หน้าเรื่องใช้ค่านี้แทนคะแนนจาก MV
- report คอมเมนต์/รีวิวซ้ำไม่ได้ (unique ต่อ reporter + target → `already_reported`)

## Studio + Admin (`studio_admin`)

- `episodes.page_count` ตาม `episode_pages` อัตโนมัติ (trigger `sync_page_count`, security definer เพราะ uploader ไม่มีสิทธิ์เขียนคอลัมน์นี้)
- RPC (EXECUTE เฉพาะ `service_role`, id จาก session):

| ฟังก์ชัน | ทำอะไร |
|---|---|
| `get_uploader_stats(uploader)` | ต่อเรื่อง (ไม่รวมที่ลบ): วิว ทั้งหมด/30 วัน, ผู้ติดตาม, ยอดซื้อ (unlock ที่ไม่ถูก refund รวม welcome coin), รายได้ (earning ที่ไม่ถูกหักคืน) — สด ไม่ใช้ MV เพราะต้องรวม draft/เรื่องที่ปิดตรวจ |
| `get_uploader_episode_stats(uploader, series)` | วิว + ยอดซื้อรายตอน (เฉพาะเรื่องของ uploader คนนั้น) |
| `get_uploader_balance(uploader)` | `withdrawable` (กฎเดียวกับ `request_withdrawal`), `waiting` (< 30 วัน หรือเรื่องถูกปิดตรวจ), `next_available_at`, `processing` (อยู่ในคำขอ pending/approved), `paid` |
| `set_content_hidden(admin, comment\|review, id, hidden, note)` | ซ่อน/เลิกซ่อน; ซ่อนแล้วปิด report ที่เปิดอยู่ของรายการนั้นเป็น `resolved` |
| `resolve_report(report, admin, resolved\|dismissed, note)` | ปิด report ที่ยัง `open` (ไม่งั้น `report_not_open`) |
| `set_user_verified(user, admin, bool)` | verified badge |
| `admin_find_users(admin, query, limit)` | ค้นด้วย email / username / ชื่อ / id (security definer เพื่ออ่าน `auth.users`; escape `%` `_`) |

- กฎของ uploader ที่ DB บังคับอยู่แล้ว (RLS/trigger เดิม): เขียนได้เฉพาะเรื่องตัวเอง, บัญชีถูกระงับ → 42501, ราคาเปลี่ยนได้เดือนละครั้งหลังปล่อย + ตอนที่ปล่อยแล้วเลื่อนเวลาไม่ได้ (23514), ลบตอนตรงได้เฉพาะที่ยังไม่ปล่อย (ที่ปล่อยแล้วต้อง `remove_episode`)

## R2 object keys (`r2_storage_keys`)

- uploader เขียน `episode_pages` / `series` ตรงผ่าน RLS → ถ้าไม่กัน จะตั้ง `storage_key` ชี้หน้าตอนเสียเงินของเรื่องอื่นแล้วได้ signed URL ผ่านตอนฟรีของตัวเอง
- trigger `check_storage_key` / `check_cover_key` (เฉพาะ `current_user = 'authenticated'`; service_role/migration ข้าม): `storage_key` ต้องเป็น `episodes/<series_id>/<episode_id>/<batch>/<NNN>.<ext>`, `cover_key` ต้องเป็น `covers/<series_id>/<uuid>.(webp|jpg)` → ไม่งั้น `invalid_storage_key`

## Tests

- pgTAP: `supabase/tests/database/server_functions.test.sql`, `coin_checkout.test.sql`, `cron_jobs.test.sql`, `ranking.test.sql`, `series_page.test.sql`, `birth_date_lock.test.sql`, `reader_pages.test.sql`, `comments_reviews.test.sql`, `studio_admin.test.sql`, `r2_storage_keys.test.sql` (กรองเฉพาะ fixture id ของตัวเอง จึงรันกับ DB ที่มีข้อมูลทดสอบได้) — ผ่าน `supabase db advisors`
- test ใช้ fixture id ตายตัว (เช่น user `…a1`) → รันกับ DB ที่ใส่ข้อมูลทดสอบหน้าเว็บไว้แล้วจะชน/ผลเพี้ยน; รันหลัง `npx supabase db reset --local`
- รัน: `npx supabase test db`
