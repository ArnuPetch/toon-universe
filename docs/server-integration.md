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
  - หน้า uploader ที่จะทำ (publish/unpublish, แก้ชื่อ/ปก/เรตอายุ) ต้องเรียก `invalidateCatalog()` ด้วย

## Types & Env

- Types: `npm run db:types` → `src/lib/supabase/database.types.ts` (รันใหม่ทุกครั้งที่แก้ schema)
- Env: ดู `.env.example`

## Tests

ทดสอบ e2e กับ local แล้ว: login ผ่าน cookie, cookie ปลอม → null, error mapping, ban → login ไม่ได้, lift → login ได้

Stripe webhook (event ที่ sign เองกับ local dev server): signature ผิด → 400, unpaid → ไม่เติม, ยอดไม่ตรง → ปฏิเสธ + log, paid → เติม 1 ครั้ง, event ซ้ำ → ไม่เติมซ้ำ, expired หลังจ่ายแล้ว → ไม่ downgrade
- ยังไม่ได้ทดสอบกับ Stripe sandbox จริง (ยังไม่มี key) — `startCoinCheckout` ยังไม่เคยเรียก API จริง
