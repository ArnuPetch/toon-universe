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
- [docs/server-integration.md](docs/server-integration.md) — Next.js ↔ Supabase: clients, proxy, auth helpers, RPC wrapper, error mapping, ban sync กับ Auth

## Tech stack (สรุป)

TypeScript · Next.js · Supabase · Cloudflare R2 · Vercel Hobby (dev) → Cloudflare Workers (production) · Stripe (PromptPay only)

## สถานะปัจจุบัน (อัพเดต 2026-11-01)

**ขั้นตอน: Stripe PromptPay checkout + webhook ต้นแบบเสร็จแล้ว, ตั้ง sandbox แล้ว → ถัดไปคือทำหน้าทดสอบ `/dev/coins` แล้วลองซื้อด้วย PromptPay จริงใน sandbox**

เสร็จแล้ว (รายละเอียดใน docs):

- Next.js + Supabase client packages (`@supabase/ssr`, `@supabase/supabase-js`) ติดตั้งแล้ว ยังไม่มีหน้าเว็บ
- Schema + RLS + triggers (`supabase/migrations/`) — [docs/database.md](docs/database.md)
- Server-side functions (RPC): unlock, donate, remove + refund, withdrawal, sanction, content hold พร้อม pgTAP tests — [docs/database.md](docs/database.md)
- เชื่อม Next.js กับ Supabase (`src/lib/`): clients, proxy, auth, RPC wrapper, error mapping, ban sync — [docs/server-integration.md](docs/server-integration.md)
- Stripe Checkout (PromptPay) + webhook → `coin_purchases` / `coin_wallets` / `coin_ledger` — [docs/server-integration.md](docs/server-integration.md#stripe-checkout-promptpay)
- Cron (pg_cron): แจ้งตอนใหม่ + `last_episode_at`, ปลด suspend ที่ครบเวลา, ตัด welcome coin หมดอายุ — [docs/database.md](docs/database.md#cron-jobs-cron_jobs)

กฎสำคัญ (ห้ามพลาด):

- **Client อ่านข้อมูลการเงินได้เฉพาะของตัวเอง เขียนไม่ได้** — งานการเงิน/admin ทำฝั่ง server ด้วย `service_role` ผ่าน RPC
- **id ผู้ใช้/admin ต้องเอาจาก session ที่ verify แล้ว (`getClaims()`) ห้ามรับจาก request body**
- **เติม coin เฉพาะใน Stripe webhook** (verify signature แล้ว) ห้ามเติมจากหน้า success
- เพิ่ม error code ใหม่ใน SQL ต้องเพิ่มใน `src/lib/server/errors.ts` ด้วย
- แก้ schema แล้วรัน `npm run db:types` ใหม่ทุกครั้ง
- Push migration ไปที่ branch `dev` → Supabase GitHub integration apply ให้เอง

ยังไม่ได้ทำ (เรียงตามลำดับที่ควรทำ):

1. ทดสอบ Stripe กับ sandbox จริง — ดู [Stripe sandbox](#stripe-sandbox) ด้านล่าง
2. Ranking / recommendation (materialized views)
3. หน้าเว็บ Reader / Uploader / Admin

Local dev: `npx supabase start` (Studio: http://127.0.0.1:54323), `npx supabase db reset --local` เพื่อ apply migration ใหม่, `npx supabase test db` เพื่อรัน pgTAP tests

### Stripe sandbox

- Sandbox "Toon Universe sandbox" (บัญชีไทย) สร้างแล้ว, Stripe CLI login แล้ว, Dashboard เปิดแค่ PromptPay
- รัน 3 terminal แยกกัน: `npx supabase start` / `npm run dev` / `stripe listen --forward-to localhost:3000/api/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired` (`whsec_…` ที่ได้ → `STRIPE_WEBHOOK_SECRET` ใน `.env.local` แล้ว restart dev)
- `stripe trigger checkout.session.completed` ใช้ไม่ได้ตอนเปิดแค่ PromptPay: fixture ใช้ USD + จ่ายด้วยบัตร (`--override price:currency=thb` แก้ได้แค่เรื่องสกุลเงิน) → ต้องเปิด Cards ชั่วคราวแล้วปิดคืน หรือข้ามไปทดสอบผ่านหน้าทดสอบเลย
- event จาก `stripe trigger` ไม่มี `client_reference_id` ของเรา → webhook ตอบ 200 แต่ไม่เติม coin (ตั้งใจ)
- ยังไม่มีหน้า login/ซื้อ coin → ทดสอบซื้อจริงต้องมีหน้าทดสอบ `/dev/coins` (dev only) ก่อน
