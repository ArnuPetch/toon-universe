# Toon Universe

Web app สำหรับอ่านและอัพโหลด manga, manhwa ฯลฯ

- ผู้อ่าน (reader) เติมเงินซื้อ **coin** เพื่อ unlock ตอน (อ่านได้ 30 วัน)
- ผู้อัพโหลด (uploader) ได้รับรายได้จาก coin ที่ผู้อ่านใช้กับผลงานของตน
- บัญชีเดียวใช้ได้ทั้ง reader และ uploader

## Content structure

เรื่อง (Series) → Season (optional) → ตอน (Episode) → หน้า (Page)

## Docs

รายละเอียดแยกตามหัวข้อ อ่านไฟล์ที่เกี่ยวข้องก่อนทำงานในส่วนนั้น:

- [docs/features.md](docs/features.md) — Feature scope: Reader, Uploader, Admin, Report system
- [docs/coin-and-revenue.md](docs/coin-and-revenue.md) — Coin system, revenue split, withdrawal, refund, ban/suspend, coin pack pricing
- [docs/policies.md](docs/policies.md) — Terms of Service, Privacy Policy (PDPA), Copyright
- [docs/tech-stack.md](docs/tech-stack.md) — Tech stack ที่ใช้
- [docs/database.md](docs/database.md) — Migrations, schema/RLS/triggers, server-side functions (RPC), lock order, การตัดสินใจเรื่อง ban/withdrawal/content hold, pgTAP tests
- [docs/server-integration.md](docs/server-integration.md) — Next.js ↔ Supabase: clients, proxy, auth helpers, RPC wrapper, error mapping, ban sync กับ Auth, cache ข้อมูลสาธารณะ
- [docs/frontend.md](docs/frontend.md) — หลักการทำหน้าเว็บ: ต้นแบบ (หน้า Home), design tokens, components, data/cache, mutations, a11y, วิธีตรวจงาน

## Tech stack (สรุป)

TypeScript · Next.js · Supabase · Cloudflare R2 · Vercel Hobby (dev) → Cloudflare Workers (production) · Stripe (PromptPay only)

## สถานะปัจจุบัน (อัพเดต 2026-11-02)

**ขั้นตอน: R2 (อัพโหลด + เสิร์ฟรูป) เสร็จ + ตั้ง bucket/CORS แล้ว → ถัดไปคือทดสอบอัพโหลดผ่านหน้า `/studio`, แล้ว watermark / กราฟสถิติ**

เสร็จแล้ว (รายละเอียดใน docs):

- Next.js + Supabase client packages (`@supabase/ssr`, `@supabase/supabase-js`)
- Schema + RLS + triggers (`supabase/migrations/`) — [docs/database.md](docs/database.md)
- Server-side functions (RPC): unlock, donate, remove + refund, withdrawal, sanction, content hold พร้อม pgTAP tests — [docs/database.md](docs/database.md)
- เชื่อม Next.js กับ Supabase (`src/lib/`): clients, proxy, auth, RPC wrapper, error mapping, ban sync — [docs/server-integration.md](docs/server-integration.md)
- Stripe Checkout (PromptPay) + webhook → `coin_purchases` / `coin_wallets` / `coin_ledger` — [docs/server-integration.md](docs/server-integration.md#stripe-checkout-promptpay)
- Cron (pg_cron): แจ้งตอนใหม่ + `last_episode_at`, ปลด suspend ที่ครบเวลา, ตัด welcome coin หมดอายุ — [docs/database.md](docs/database.md#cron-jobs-cron_jobs)
- นับยอดวิว + Ranking (materialized views) + "คนที่อ่านเรื่องนี้ก็อ่าน" — [docs/database.md](docs/database.md#ranking--recommendation-ranking), `src/lib/server/ranking.ts`
- หน้า Login / สมัครสมาชิก `/login` (email + password, Server Actions `src/app/actions/auth.ts`, ยืนยัน email ที่ `/auth/confirm`) — [docs/server-integration.md](docs/server-integration.md#login--สมัครสมาชิก)
- หน้า Home (`src/app/page.tsx`, ข้อมูลจาก `src/lib/server/home.ts`) + cache ข้อมูลสาธารณะ (tag `catalog`, ล้างด้วย `invalidateCatalog()`) — [docs/frontend.md](docs/frontend.md), [docs/server-integration.md](docs/server-integration.md#cache-ข้อมูลสาธารณะ-catalog)
- หน้าเรื่อง `/series/[slug]` + หน้าอ่าน `/series/[slug]/[number]` (unlock ด้วย coin, นับวิว, บันทึก progress/โหมดอ่าน, ติดตาม/ชั้นหนังสือ, age gate) — ข้อมูลจาก `src/lib/server/series.ts`, actions `src/app/actions/reader.ts` + `bookshelf.ts` — [docs/frontend.md](docs/frontend.md#หน้าเรื่อง--หน้าอ่าน)
- หน้าอื่นของ Reader: `/search`, `/ranking`, `/genres`, `/genres/[slug]`, `/updates` (RPC `search_series`, ข้อมูลจาก `src/lib/server/browse.ts`), `/bookshelf`, `/notifications`, `/profile` (ข้อมูลจาก `src/lib/server/library.ts`, actions `notifications.ts` + `profile.ts`), ลืมรหัสผ่าน `/forgot-password` → `/reset-password`, `/terms`, `/privacy` (ร่าง รอฝ่ายกฎหมายตรวจ) — [docs/frontend.md](docs/frontend.md#หน้า-browse--ส่วนตัว)
- หน้าเติม coin `/coins` (แพ็ก + ยอด + ประวัติ, action `src/app/actions/coins.ts`, ข้อมูลจาก `src/lib/server/coins.ts`) — **ทดสอบกับ Stripe sandbox จริงแล้ว** (PromptPay → webhook → เติม coin) — [docs/frontend.md](docs/frontend.md#หน้าเติม-coin-coins)
- คอมเมนต์ + รีวิว/ให้คะแนน รายเรื่อง/รายตอน (ตอบกลับ 1 ชั้น + แจ้งเตือน, spoiler, แก้/ลบ, รายงาน) — กฎใน DB `20261101180000_comments_reviews.sql`, ข้อมูล `src/lib/server/social.ts`, actions `src/app/actions/social.ts`, UI `src/components/social/` — [docs/database.md](docs/database.md#คอมเมนต์--รีวิว-comments_reviews), [docs/frontend.md](docs/frontend.md#คอมเมนต์--รีวิว)
- หน้า Uploader `/studio` (เรื่อง, season, ตอน, ราคา, ตั้งเวลา, อัพโหลดหน้า/ปก, สถิติ, รายได้/บัญชีพร้อมเพย์/ถอน) + หน้า Admin `/admin` (report, ซ่อนคอมเมนต์/รีวิว, ปิดตรวจ/ถอดเรื่อง, ระงับ/แบน/ปลด, verified badge, อนุมัติถอน/บันทึกโอน) — migration `20261102090000_studio_admin.sql`, ข้อมูล `src/lib/server/studio.ts` + `admin.ts`, actions `studio.ts` + `admin.ts` — [docs/frontend.md](docs/frontend.md#สตูดิโอ-uploader-studio), [docs/database.md](docs/database.md#studio--admin-studio_admin)

กฎสำคัญ (ห้ามพลาด):

- **Client อ่านข้อมูลการเงินได้เฉพาะของตัวเอง เขียนไม่ได้** — งานการเงิน/admin ทำฝั่ง server ด้วย `service_role` ผ่าน RPC
- **id ผู้ใช้/admin ต้องเอาจาก session ที่ verify แล้ว (`getClaims()`) ห้ามรับจาก request body**
- **เติม coin เฉพาะใน Stripe webhook** (verify signature แล้ว) ห้ามเติมจากหน้า success
- เพิ่ม error code ใหม่ใน SQL ต้องเพิ่มใน `src/lib/server/errors.ts` ด้วย
- แก้ schema แล้วรัน `npm run db:types` ใหม่ทุกครั้ง
- Push migration ไปที่ branch `dev` → Supabase GitHub integration apply ให้เอง
- **เปลี่ยนอะไรที่ทำให้เนื้อหาสาธารณะเปลี่ยน (publish, แก้ชื่อ/ปก/เรต, ลบ, hold, แบน) ต้องเรียก `invalidateCatalog()`** ไม่งั้นคนที่ไม่ login เห็นของเก่า/เรื่องที่ถูกถอด
- หน้าเว็บ: ใช้ token สีใน `globals.css` ห้าม hardcode, ส่วนที่อ่าน session อยู่ใต้ `<Suspense>`, ข้อมูลส่วนตัวไม่ cache
- **หน้าใหม่ไม่ต้องดู Figma แล้ว** (ไม่ต้องเรียก Figma MCP) — ใช้หน้า Home (`src/app/page.tsx` + `src/components/home/`) เป็นต้นแบบเรื่องหน้าตา, layout, spacing และ component

- R2: อัพโหลดตรงจาก browser ด้วย presigned PUT (หน้าของตอน + .zip, ปก) และเสิร์ฟรูป (หน้าของตอนผ่าน signed URL จาก bucket private, ปกจาก bucket public) + trigger กัน key ข้ามเรื่อง — `src/lib/r2/`, migration `20261102120000_r2_storage_keys.sql` — [docs/server-integration.md](docs/server-integration.md#r2-รูปปก--หน้าของตอน) (มีขั้นตอนตั้ง bucket/CORS) — ทดสอบกับ bucket จริงแล้ว (presigned PUT/HEAD/signed GET/DELETE/CORS, หน้าอ่าน + ปก) **ยังไม่ได้ลองอัพโหลดผ่าน UI `/studio`**

ยังไม่ได้ทำ (เรียงตามลำดับที่ควรทำ):

1. ทดสอบอัพโหลดหน้า/.zip/ปกผ่าน `/studio`, งานเก็บกวาด batch ที่อัพโหลดแล้วไม่ได้บันทึก
2. Watermark อัตโนมัติ, กราฟสถิติรายวันของ uploader

ฟีเจอร์ที่จะทำทีหลัง (ยังไม่ต้องทำตอนนี้):

- **OAuth2 (เข้าสู่ระบบด้วย Google)** — ตอนนี้มีแค่ปุ่ม disabled "(เร็วๆ นี้)" ใน `src/components/auth/auth-form.tsx`; ตอนทำ: เปิด provider ใน Supabase Auth, `signInWithOAuth` + callback route แลก code เป็น session, ตรวจว่า welcome coin / เรตอายุ (วันเกิด) / ban ทำงานกับบัญชี OAuth ด้วย

Local dev: `npx supabase start` (Studio: http://127.0.0.1:54323), `npx supabase db reset --local` เพื่อ apply migration ใหม่, `npx supabase test db` เพื่อรัน pgTAP tests

### Stripe sandbox

- Sandbox "Toon Universe sandbox" (บัญชีไทย) สร้างแล้ว, Stripe CLI login แล้ว, Dashboard เปิดแค่ PromptPay
- รัน 3 terminal แยกกัน: `npx supabase start` / `npm run dev` / `stripe listen --forward-to localhost:3000/api/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired` (`whsec_…` ที่ได้ → `STRIPE_WEBHOOK_SECRET` ใน `.env.local` แล้ว restart dev)
- `stripe trigger checkout.session.completed` ใช้ไม่ได้ตอนเปิดแค่ PromptPay: fixture ใช้ USD + จ่ายด้วยบัตร (`--override price:currency=thb` แก้ได้แค่เรื่องสกุลเงิน) → ต้องเปิด Cards ชั่วคราวแล้วปิดคืน หรือข้ามไปทดสอบผ่านหน้าทดสอบเลย
- event จาก `stripe trigger` ไม่มี `client_reference_id` ของเรา → webhook ตอบ 200 แต่ไม่เติม coin (ตั้งใจ)
- จ่ายแล้วแต่ coin ไม่เข้า (purchase ค้าง `pending`) → ส่วนใหญ่เพราะ `stripe listen` ไม่ได้รันตอนจ่าย (local ไม่มีทางอื่นให้ webhook เข้ามา): เช็ค `stripe checkout sessions retrieve <cs_…>` ว่า `payment_status: paid` → เปิด `stripe listen` แล้ว `stripe events resend <evt_…>` (หา evt จาก `stripe events list --type checkout.session.completed`) — webhook idempotent ส่งซ้ำได้ปลอดภัย
- ต้องตั้ง `APP_URL` ใน `.env.local` (ใช้สร้าง success/cancel URL) ไม่งั้นกดซื้อแล้วได้ `unexpected_error`
- ทดสอบซื้อจริง: login → `/coins` → กดแพ็ก → Checkout กด "ดำเนินการต่อ" → ใน QR กด "จำลองการสแกน" → แท็บใหม่ "Authorize Test Payment" (สำเร็จ → เติม coin) หรือ "Expire Test Payment" (QR หมดอายุ แต่ session ยังเปิด ลองใหม่ได้ → purchase ยัง `pending` จน session หมดอายุ 30 นาที → `canceled`)
