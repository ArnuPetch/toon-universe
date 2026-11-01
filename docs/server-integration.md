# Next.js ↔ Supabase (`src/lib/`)

## Supabase clients

| ไฟล์ | ใช้ที่ไหน | สิทธิ์ |
|---|---|---|
| `supabase/client.ts` | Browser | anon key + session ผู้ใช้ |
| `supabase/server.ts` | Server Components / Server Actions | session ผู้ใช้ → RLS |
| `supabase/admin.ts` | Server เท่านั้น (`server-only`) | `service_role`, env `SUPABASE_SECRET_KEY` (ห้ามใช้ prefix `NEXT_PUBLIC_`) |

## Proxy

- `src/proxy.ts` (Next 16 เปลี่ยน middleware → proxy) refresh token ด้วย `getClaims()` — เป็นที่เดียวที่ refresh
- ตั้ง cookie `tu_vid` (UUID สุ่ม, httpOnly, 1 ปี) ให้ผู้เข้าชมที่ยังไม่มี — ใช้นับวิวของคนที่ไม่ได้ login; ตั้งใน request ด้วยเพื่อให้ Server Components ใน request แรกเห็น

## Server helpers

- `server/auth.ts`: `getClaims` (cache ต่อ request; เรียก `connection()` ก่อน เพราะการ verify JWT อ่านเวลา — ห้ามเกิดตอน prerender), `requireUserId`, `requireAdminId` (เช็ค `app_metadata.role`)
- `server/rpc.ts`: wrapper ทุก RPC (ดู [database.md](database.md))
  - **ดึง id จาก session เอง ไม่รับจาก caller**
  - คืน `ActionResult` (`{ok,data}` / `{ok:false,code,message}`) ไม่ throw
- `server/ranking.ts`: `getSeriesRanking`, `getSeriesRecommendations` (ใช้ client ผู้ใช้ → RLS + เรตอายุ), `recordEpisodeView` (service_role; viewer = user id จาก `getClaims()` หรือ cookie `tu_vid`) — เรียกตอน server ส่งหน้าของตอนจริง
- `server/errors.ts`: map error code → ข้อความภาษาไทย
  - เพิ่ม code ใหม่ใน SQL ต้องเพิ่มที่นี่ด้วย
  - code ที่ไม่รู้จัก → `unexpected_error` + log

## Login / สมัครสมาชิก

- Email + password อย่างเดียว (ยังไม่มี OAuth — ปุ่ม "เข้าสู่ระบบด้วย Google" มีแล้วแต่ disabled + "(เร็วๆ นี้)") — หน้า `/login` (`?mode=signup`, `?next=`), form อยู่ที่ `src/components/auth/auth-form.tsx`
- Server Actions `src/app/actions/auth.ts`: `signIn`, `signUp`, `signOut`
  - map Supabase Auth error code → ข้อความไทยในไฟล์นั้นเอง (ไม่ใช่ `errors.ts` ซึ่งเป็นของ RPC); code ที่ไม่รู้จัก → ข้อความกลาง + log ไม่โชว์ข้อความดิบ
  - สมัคร: รหัสผ่าน ≥ 8 ตัว, ช่องยืนยันรหัสผ่าน (`password_confirm`) ต้องตรงกัน (เช็คฝั่ง server), ต้องติ๊กยอมรับข้อกำหนด/นโยบาย (`/terms`, `/privacy` — ยังไม่มีหน้า)
  - ยืนยัน email ปิด (local) → login ทันที; เปิด (production) → แสดง "ส่งลิงก์แล้ว" (Supabase ตอบเหมือนกันแม้ email ซ้ำ กันการเดา email)
- `?next=` ผ่าน `safeNext()` (`src/lib/safe-next.ts`) เสมอ — รับเฉพาะ path ภายในเว็บ กัน open redirect
- ลิงก์ยืนยัน email → `/auth/confirm` (`src/app/auth/confirm/route.ts`) รองรับทั้ง `?code=` (PKCE, template ปกติ) และ `?token_hash=&type=` (template custom) → trigger ใน DB ให้ welcome coin
- `emailRedirectTo` สร้างจาก host ของ request → ต้องอยู่ใน Redirect URLs ของ Supabase (local: `additional_redirect_urls` ใน `supabase/config.toml`; production: ตั้งใน Dashboard → Auth → URL Configuration)
- เปิด `/login` ตอน login อยู่แล้ว → redirect ไป `next`

## Admin (`server/admin.ts`)

- loader ของหน้า `/admin` อ่านด้วย `service_role` (เห็นของที่ซ่อน/ถูกถอด, email, การเงินของคนอื่น) → **ทุก loader เช็ค `getAdminId()` (JWT `app_metadata.role`) ก่อน**; mutation ผ่าน wrapper ใน `rpc.ts` ซึ่ง DB เช็คซ้ำด้วย `assert_admin`
- ไม่ใช่ admin → หน้า `/admin/*` ตอบ 404 (`AdminShell` ใน `src/components/admin/shell.tsx`)
- ตั้ง admin: `app_metadata.role = 'admin'` (Dashboard → Auth → user → raw app meta data หรือ `auth.admin.updateUserById`) — ห้ามใช้ `user_metadata`

## Ban / lift กับ Supabase Auth

- `banUser`: เรียก RPC ก่อน แล้วค่อย Auth ban (`ban_duration`)
  - ถ้า Auth ban ล้มเหลวคืน `session_revoked: false` → เรียก `syncAuthBan` ซ้ำ
- `liftSanction`: ปลด Auth ban เมื่อ status ไม่ใช่ banned

## Stripe Checkout (PromptPay)

| ไฟล์ | หน้าที่ |
|---|---|
| `stripe/server.ts` | Stripe client (server only), fetch HTTP client — ใช้ได้ทั้ง Node และ Cloudflare Workers |
| `server/coin-checkout.ts` | `startCoinCheckout(packId)` → สร้าง purchase (pending) + Checkout Session → คืน `checkoutUrl` ให้ redirect |
| `app/api/stripe/webhook/route.ts` | verify signature (`constructEventAsync` + SubtleCrypto) → เติม coin |

- **เติม coin เฉพาะใน webhook** ห้ามเติมจากหน้า success (ผู้ใช้อาจปิดแท็บหลังจ่าย)
- Webhook events ที่ต้อง subscribe: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
  - `completed` เติมเฉพาะเมื่อ `payment_status = 'paid'`
- Response: 200 = จัดการแล้ว/ไม่เกี่ยว/ถูกปฏิเสธถาวร (log ไว้ให้คนดู), 500 = DB/network ขัดข้อง → Stripe retry เอง
- PromptPay อย่างเดียว: เปิดเฉพาะ PromptPay ใน Dashboard (หรือ payment method configuration → `STRIPE_PAYMENT_METHOD_CONFIGURATION`) — **ไม่ใช้ `payment_method_types`**
- Session หมดอายุ 30 นาที (ขั้นต่ำของ Stripe) → purchase เป็น `canceled`
- Idempotency key `coin-purchase-<id>` → 1 purchase = 1 session
- Proxy ข้าม `/api/stripe/webhook` (ไม่มี session)
- ทดสอบ local: `stripe listen --forward-to localhost:3000/api/stripe/webhook` แล้วใส่ `whsec_…` ที่ได้ใน `STRIPE_WEBHOOK_SECRET`

## Cache ข้อมูลสาธารณะ (catalog)

- เปิด `cacheComponents` → ข้อมูลที่อ่าน cookie ต้องอยู่ใน `<Suspense>`; ใน `'use cache'` ห้ามอ่าน cookie/header
- ส่วนรวมของหน้า Home (hero, ranking, อัพเดตล่าสุด, กำลังมาแรง) ใน `src/lib/server/home.ts`:
  - **ไม่ login** → `'use cache'` + `createPublicClient()` (`src/lib/supabase/public.ts`, anon ไม่มี session → เห็นเฉพาะเรต `all`) ใช้ร่วมกันทุกคน
  - **login** → query สดด้วย `createClient()` (RLS + เรตอายุของผู้ใช้) — ไม่ cache เพราะผลต่างกันตามอายุ
  - ข้อมูลส่วนตัว (coin, แจ้งเตือน, อ่านต่อ) ไม่ cache เลย
- อายุ cache (`src/lib/server/catalog-cache.ts`): ranking/trending/hero revalidate 10 นาที (ตามรอบ refresh MV), อัพเดตล่าสุด 1 นาที (ตอนใหม่ปล่อยโดย pg_cron ซึ่งแจ้ง Next ไม่ได้)
- ทุกอย่างติด tag `catalog` → **อะไรที่ซ่อน/แสดงเนื้อหาต่อสาธารณะต้องเรียก `invalidateCatalog()`** (ล้างทันที `expire: 0`) — ตอนนี้ต่อไว้ที่ `removeSeries`, `removeEpisode`, `startContentHold`, `endContentHold`, `banUser` ใน `rpc.ts`
  - หน้า uploader (`src/app/actions/studio.ts`) เรียกหลังแก้เรื่อง/season/ตอน/เผยแพร่ และ `setUserVerified` (badge แสดงบนหน้าเรื่อง)

## R2 (รูปปก + หน้าของตอน)

- `src/lib/r2/server.ts` (server-only, `aws4fetch` — fetch + WebCrypto ใช้ได้ทั้ง Vercel และ Workers) + `src/lib/r2/shared.ts` (ชนิดไฟล์, ขนาดสูงสุด, รูปแบบ key, `coverUrl()` — ใช้ได้ทั้ง browser/server)
- 2 bucket: **`R2_BUCKET` (private)** = หน้าของตอน เข้าถึงได้ทาง signed GET เท่านั้น; **`R2_PUBLIC_BUCKET`** = ปก เสิร์ฟจาก `NEXT_PUBLIC_R2_PUBLIC_URL` (r2.dev ตอน dev, custom domain ตอน production) — ปกอยู่ใน cache `catalog` ที่ใช้ร่วมกันทุกคน จึงใช้ signed URL ไม่ได้
- อัพโหลด = browser PUT ตรงเข้า R2 ด้วย presigned URL (ไม่ผ่าน server ของเรา): `prepare*Upload` ตรวจว่าเป็นเจ้าของ + เลือก key + sign (Content-Type, Content-Length, Cache-Control ถูก sign ด้วย ส่งไม่ตรง = 403) → PUT → `save*` สร้าง key ใหม่จาก (series, episode, batch) เอง (**client ไม่เคยส่ง key ของหน้า**), HEAD ทุกไฟล์ (มีจริง, ≤ 20 MB, `image/*`) แล้วค่อยเขียน DB + ลบ object ชุดเก่า
- ลบตอนที่ยังไม่ปล่อย → ลบรูปใน R2 ด้วย; ตอน/เรื่องที่ปล่อยแล้ว (soft delete + refund) **ยังเก็บรูปไว้**
- ไม่ได้ตั้ง `R2_*` → อัพโหลดได้ `storage_unavailable`, หน้าอ่าน/ปกแสดง placeholder (ไม่ crash)
- ข้อจำกัดที่รู้อยู่: batch ที่อัพโหลดแล้วไม่กดบันทึก (ปิดหน้ากลางทาง/บันทึกไม่ผ่าน) ค้างใน bucket — ยังไม่มีงานเก็บกวาด

### ตั้งค่า R2 (ครั้งแรก)

1. Cloudflare Dashboard → R2 → สร้าง bucket `toon-universe-pages` (private) และ `toon-universe-public` → Settings → Public access: เปิด r2.dev subdomain (production: ผูก custom domain แทน) → URL ที่ได้ = `NEXT_PUBLIC_R2_PUBLIC_URL`
2. R2 → Manage API tokens → สร้าง token สิทธิ์ **Object Read & Write** เฉพาะ 2 bucket นี้ → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; Account ID → `R2_ACCOUNT_ID`
3. CORS (ทั้ง 2 bucket — ให้ browser PUT ได้; ใส่ origin production เพิ่มตอน deploy):
   ```json
   [{ "AllowedOrigins": ["http://localhost:3000"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type", "cache-control"], "MaxAgeSeconds": 3600 }]
   ```
4. ใส่ค่าใน `.env.local` ตาม `.env.example` แล้ว restart `npm run dev`

## Types & Env

- Types: `npm run db:types` → `src/lib/supabase/database.types.ts` (รันใหม่ทุกครั้งที่แก้ schema)
- Env: ดู `.env.example`

## Tests

ทดสอบ e2e กับ local แล้ว: login ผ่าน cookie, cookie ปลอม → null, error mapping, ban → login ไม่ได้, lift → login ได้

Stripe webhook (event ที่ sign เองกับ local dev server): signature ผิด → 400, unpaid → ไม่เติม, ยอดไม่ตรง → ปฏิเสธ + log, paid → เติม 1 ครั้ง, event ซ้ำ → ไม่เติมซ้ำ, expired หลังจ่ายแล้ว → ไม่ downgrade
Stripe sandbox จริง (2026-11-01, ผ่านหน้า `/coins`): Checkout แสดงเฉพาะ PromptPay, THB, ภาษาไทย, email ผู้ใช้ → authorize test payment → `checkout.session.completed` (paid) → webhook 200 → purchase `succeeded` + wallet +coin + ledger `purchase`; QR หมดอายุ → session ยังเปิด purchase ยัง `pending`; กดย้อนกลับ → `/coins?checkout=canceled`
