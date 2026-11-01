# Tech Stack

| ส่วน | ใช้ | หมายเหตุ |
|---|---|---|
| Language | TypeScript | ทั้งระบบ |
| Framework | Next.js | หน้าเว็บและ API ในโปรเจคเดียว |
| Database + Auth | Supabase | มีระบบยืนยัน email ใช้กับ welcome coin; free plan พักโปรเจคถ้าไม่มีการใช้งาน 1 สัปดาห์ |
| Image storage | Cloudflare R2 | ฟรี 10 GB, ไม่คิดค่า egress; รูปตอนเสียเงินใช้ signed URL (ลิงก์ชั่วคราว) กันแชร์ลิงก์อ่านฟรี |
| Hosting | Vercel Hobby (development) → Cloudflare Workers (production) | Hobby ห้ามใช้เชิงพาณิชย์ |
| Payment | Stripe | รับ PromptPay อย่างเดียว (ค่าธรรมเนียม 1.65%) |
