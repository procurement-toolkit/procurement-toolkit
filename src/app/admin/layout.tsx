import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/queries";
import { signOut } from "@/lib/actions/auth";
import { AdminSidebar } from "@/components/AdminSidebar";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await getMyProfile();

  // Middleware already blocks non-admins from /admin, but this keeps the
  // page itself honest if it's ever rendered a different way.
  if (!profile || profile.role !== "admin") {
    redirect("/m");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col bg-bg md:flex-row">
      {/* 2026-09-21, Kevin 요청("메뉴 구조 재설계") — 이전엔 이 자리에 상단
          바 하나에 8개 메뉴를 전부 나열했지만, 10개 업무 메뉴 + 5개 관리
          메뉴로 늘면서 <AdminSidebar>로 옮겼다. 상단 바에는 브랜드/계정
          컨트롤만 남는다. */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-line bg-bg-raised px-4 py-2.5 md:hidden">
        <Link href="/admin" className="pressable flex items-center gap-1.5 whitespace-nowrap rounded-lg px-1 py-1">
          <Image src="/hk-mark.png" alt="HK" width={48} height={21} className="h-[18px] w-auto" priority />
          <span className="font-mono text-[11px] font-bold tracking-wide text-accent-ink">HK PIS</span>
        </Link>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-faint">
          <span className="whitespace-nowrap">{profile.name}</span>
          <Link
            href="/account/password"
            className="pressable whitespace-nowrap rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft"
          >
            비밀번호 변경
          </Link>
          <Link href="/m" className="pressable whitespace-nowrap rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft">
            IMMS 화면
          </Link>
          <form action={signOut}>
            <button type="submit" className="pressable whitespace-nowrap rounded px-1.5 py-0.5 active:bg-bg-sunken">
              로그아웃
            </button>
          </form>
        </div>
      </div>
      <div className="flex flex-col md:w-56 md:shrink-0 md:border-r md:border-line">
        <div className="hidden items-center justify-between border-b border-line bg-bg-raised px-3 py-3 md:flex">
          <Link href="/admin" className="pressable flex items-center gap-1.5 whitespace-nowrap rounded-lg px-1 py-1">
            <Image src="/hk-mark.png" alt="HK" width={48} height={21} className="h-[18px] w-auto" priority />
            <span className="font-mono text-[11px] font-bold tracking-wide text-accent-ink">HK PIS</span>
          </Link>
        </div>
        <AdminSidebar />
        <div className="mt-auto hidden flex-col gap-1.5 border-t border-line px-3 py-3 text-[12px] text-ink-faint md:flex">
          <span className="whitespace-nowrap font-medium text-ink-soft">{profile.name}</span>
          <Link href="/account/password" className="pressable whitespace-nowrap rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft">
            비밀번호 변경
          </Link>
          <Link href="/m" className="pressable whitespace-nowrap rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft">
            IMMS 화면
          </Link>
          <form action={signOut}>
            <button type="submit" className="pressable self-start whitespace-nowrap rounded px-1.5 py-0.5 active:bg-bg-sunken">
              로그아웃
            </button>
          </form>
        </div>
      </div>
      <div className="flex-1 p-4 md:p-6">{children}</div>
    </div>
  );
}
