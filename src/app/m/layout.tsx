import Link from "next/link";
import Image from "next/image";
import { getMyProfile } from "@/lib/queries";
import { signOut } from "@/lib/actions/auth";

export default async function MobileLayout({ children }: LayoutProps<"/m">) {
  const profile = await getMyProfile();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-bg">
      <div className="flex items-center justify-between border-b border-line bg-bg-raised px-4 py-2.5">
        <Link href="/m" className="pressable flex items-center gap-1.5 rounded-lg px-1 py-1">
          <Image src="/hk-mark.png" alt="HK" width={48} height={21} className="h-[18px] w-auto" priority />
          <span className="font-mono text-[11px] font-bold tracking-wide text-accent-ink">HKIMMS</span>
        </Link>
        <div className="flex items-center gap-3 text-[12px] text-ink-faint">
          <span>{profile?.name ?? ""}</span>
          {profile?.role === "admin" && (
            <Link href="/admin" className="pressable rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft">
              PIS 화면
            </Link>
          )}
          <Link href="/account/password" className="pressable rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft">
            비밀번호 변경
          </Link>
          <form action={signOut}>
            <button type="submit" className="pressable rounded px-1.5 py-0.5 active:bg-bg-sunken">
              로그아웃
            </button>
          </form>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
