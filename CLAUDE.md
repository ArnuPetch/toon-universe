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

## Tech stack (สรุป)

TypeScript · Next.js · Supabase · Cloudflare R2 · Vercel Hobby (dev) → Cloudflare Workers (production) · Stripe (PromptPay only)

## สถานะปัจจุบัน (อัพเดต 2026-11-01)

**ขั้นตอน: Database schema ต้นแบบเสร็จแล้ว → ถัดไปคือเขียน server-side logic และเชื่อม Next.js กับ Supabase**

เสร็จแล้ว:

- Next.js + Supabase client packages (`@supabase/ssr`, `@supabase/supabase-js`) ติดตั้งแล้ว ยังไม่มีหน้าเว็บ/โค้ดฝั่งแอป
- Supabase GitHub integration ผูกกับ branch `dev`: push migration ไปที่ `dev` แล้ว integration จะ apply ให้เอง
- Schema ต้นแบบ: `supabase/migrations/20261101081833_init_schema.sql` (imperative migrations, ไม่ใช้ declarative schemas)
  - ผ่าน `supabase db advisors` แล้ว และทดสอบ RLS/trigger กับ local Supabase (Docker) แล้ว
  - RLS เปิดทุกตาราง; ถอน default grants แล้วให้สิทธิ์ทีละตาราง/คอลัมน์
  - **Client อ่านข้อมูลการเงินได้เฉพาะของตัวเอง เขียนไม่ได้** — unlock, donate, refund, withdrawal, ban, ชดเชย content hold ต้องทำฝั่ง server ด้วย `service_role`; งาน admin ก็ทำผ่าน server
  - Trigger ที่มีแล้ว: สร้าง profile/wallet ตอนสมัคร, welcome coin 5 coin ตอนยืนยัน email (ครั้งเดียว), จำกัดการเปลี่ยนราคาตอนเดือนละครั้งหลังปล่อยตอน
  - Helper functions อยู่ใน schema `private` (ไม่ expose ผ่าน API)

ยังไม่ได้ทำ (เรียงตามลำดับที่ควรทำ):

1. Server-side functions/API: unlock ตอน, donate, refund เมื่อผลงานถูกลบ, ถอนเงิน, ban/suspend, ชดเชยเวลาเมื่อปิดตรวจ
2. Stripe PromptPay checkout + webhook → `coin_purchases` / `coin_wallets` / `coin_ledger`
3. Cron: ตัด welcome coin ที่หมดอายุ, ส่ง notification ตอนใหม่ที่ตั้งเวลาไว้
4. Ranking / recommendation (materialized views)
5. หน้าเว็บ Reader / Uploader / Admin

Local dev: `npx supabase start` (Studio: http://127.0.0.1:54323), `npx supabase db reset --local` เพื่อ apply migration ใหม่
