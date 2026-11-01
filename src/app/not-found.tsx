import Link from "next/link";

// 404 for every route (also used by notFound() in series / reader pages).
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[59px] max-w-[1440px] items-center px-4 lg:h-[75px] lg:px-12">
          <Link href="/" className="text-lg font-bold leading-[1.4] tracking-tight lg:text-[22px]">
            <span className="text-primary">Toon</span> Universe
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-[64px] font-bold leading-none text-primary lg:text-[96px]">404</p>
        <h1 className="text-xl font-bold leading-[1.4] lg:text-2xl">ไม่พบหน้าที่คุณต้องการ</h1>
        <p className="max-w-[420px] text-sm leading-[1.5] text-muted">
          เรื่องหรือตอนนี้อาจถูกลบ ปิดชั่วคราว หรือลิงก์ไม่ถูกต้อง
        </p>
        <Link
          href="/"
          className="mt-2 flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          กลับหน้าแรก
        </Link>
      </main>
    </div>
  );
}
