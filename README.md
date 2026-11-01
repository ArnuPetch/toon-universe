# Toon Universe

Web app สำหรับอ่านและอัพโหลด manga, manhwa ฯลฯ

- **Reader** เติม coin เพื่อ unlock ตอน (อ่านได้ 30 วันหลังซื้อ)
- **Uploader** ได้รับรายได้จาก coin ที่ reader ใช้กับผลงานของตน (1 coin = 1 บาท) และถอนเป็นเงินจริงผ่าน PromptPay ได้
- บัญชีเดียวใช้ได้ทั้ง reader และ uploader

โครงสร้างผลงาน: **เรื่อง (Series) → Season (optional) → ตอน (Episode) → หน้า (Page)**

> สถานะ: อยู่ระหว่างเริ่มพัฒนา

> โปรเจคนี้พัฒนาด้วย [Claude](https://claude.com/claude-code) (Claude Code) เป็นส่วนใหญ่

## Tech stack

| ส่วน | ใช้ |
|---|---|
| Language | TypeScript |
| Framework | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 |
| Database + Auth | Supabase |
| Image storage | Cloudflare R2 |
| Hosting | Vercel Hobby (development) → Cloudflare Workers (production) |
| Payment | Stripe (PromptPay อย่างเดียว) |

รายละเอียดเพิ่มเติมดู [docs/tech-stack.md](docs/tech-stack.md)

## เริ่มต้นใช้งาน (Development)

ติดตั้ง dependencies:

```bash
npm install
```

สร้างไฟล์ `.env.local` ที่ root ของโปรเจค แล้วใส่ค่าที่จำเป็น (เช่นข้อมูลเชื่อมต่อ Supabase) — ไฟล์นี้ไม่ถูก commit

รัน development server:

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

### Scripts

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | รัน development server |
| `npm run build` | build สำหรับ production |
| `npm run start` | รัน production build |
| `npm run lint` | ตรวจโค้ดด้วย ESLint |

## โครงสร้างโปรเจค

```
src/app/   Next.js App Router (หน้าเว็บและ API)
public/    ไฟล์ static
docs/      เอกสารออกแบบระบบ
```

## Docs

- [docs/features.md](docs/features.md) — Feature scope: Reader, Uploader, Admin, Report system
- [docs/coin-and-revenue.md](docs/coin-and-revenue.md) — Coin system, revenue split, withdrawal, refund, ban/suspend, coin pack pricing
- [docs/policies.md](docs/policies.md) — Terms of Service, Privacy Policy (PDPA), Copyright
- [docs/tech-stack.md](docs/tech-stack.md) — Tech stack
