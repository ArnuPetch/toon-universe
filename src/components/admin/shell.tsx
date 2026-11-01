import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { adminGate } from "@/lib/server/admin";
import { BottomTabBar } from "../bottom-tab-bar";
import { PageMain, PageTitle, SignInPrompt } from "../page";
import { SectionSkeleton } from "../section";
import { AdminNav, type AdminSection } from "../studio/bits";
import { TopBar } from "../top-bar";

// Frame of every /admin page. The content only renders for a verified admin
// (JWT app_metadata.role); anyone else gets a 404 so the area isn't advertised.

export function AdminShell({
  section,
  title,
  sub,
  next,
  children,
}: {
  section: AdminSection;
  title: string;
  sub?: string;
  next: string;
  children: ReactNode;
}) {
  return (
    <>
      <TopBar />
      <PageMain>
        <Suspense fallback={<SectionSkeleton className="h-[480px] rounded-[20px]" />}>
          <Gate next={next}>
            <PageTitle sub={sub}>{title}</PageTitle>
            <AdminNav current={section} />
            {children}
          </Gate>
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}

async function Gate({ next, children }: { next: string; children: ReactNode }) {
  const gate = await adminGate();
  if (gate === "signed_out") return <SignInPrompt next={next} text="สำหรับผู้ดูแลระบบ" />;
  if (gate === "forbidden") notFound();
  return <>{children}</>;
}
