import Link from "next/link";

const TONE_CLASS: Record<string, string> = {
  in: "tag-in",
  prd: "tag-prd",
  mov: "tag-mov",
  shp: "tag-shp",
  ret: "tag-ret",
  qty: "tag-qty",
  log: "tag-log",
};

// 2026-09-18: 탭했을 때 그 기능 고유 색으로 배경이 확 바뀌도록(단순 축소
// 효과만으로는 "이걸 눌렀다"는 확신을 주기에 약하다는 Kevin 피드백 반영) —
// 위 tag 색과 동일한 팔레트를 active 배경으로 재사용해 일관성 유지.
const TONE_ACTIVE_BG: Record<string, string> = {
  in: "active:bg-[var(--trace-soft)]",
  prd: "active:bg-[var(--accent-soft)]",
  mov: "active:bg-[var(--mov-soft)]",
  shp: "active:bg-[var(--shp-soft)]",
  ret: "active:bg-[var(--ret-soft)]",
  qty: "active:bg-bg-sunken",
  log: "active:bg-bg-sunken",
};

export function Tile({
  href,
  code,
  label,
  disabled,
  wide,
}: {
  href: string;
  code: string;
  label: string;
  disabled?: boolean;
  wide?: boolean;
}) {
  const tone = code.toLowerCase();
  const content = (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-line bg-bg-sunken p-4 ${wide ? "col-span-2" : ""} ${
        disabled
          ? "opacity-50"
          : `pressable hover:border-line-strong ${TONE_ACTIVE_BG[tone] ?? "active:bg-bg-sunken"} active:scale-[0.94] active:border-line-strong`
      }`}
    >
      <span className={`tag ${TONE_CLASS[tone] ?? "tag-log"} w-fit`}>{code}</span>
      <span className="text-[15px] font-semibold text-ink">{label}</span>
    </div>
  );

  if (disabled) {
    return <div aria-disabled>{content}</div>;
  }

  return <Link href={href}>{content}</Link>;
}
