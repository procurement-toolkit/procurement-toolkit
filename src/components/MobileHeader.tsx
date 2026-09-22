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

export function MobileHeader({
  title,
  subtitle,
  back,
  code,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  // 2026-09-18, Kevin 요청: 페이지에 들어온 뒤에도 "내가 지금 생산불출에
  // 있는지 택배발송에 있는지" 헷갈릴 수 있다는 지적 반영 — 홈 화면
  // 타일과 같은 색의 태그를 헤더에도 그대로 표시해 재확인시켜준다.
  code?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line bg-bg-raised px-4 py-3">
      {back ? (
        <Link
          href={back}
          className="pressable rounded-full px-1.5 py-0.5 text-lg leading-none text-ink-faint hover:bg-bg-sunken active:bg-bg-sunken"
        >
          ←
        </Link>
      ) : null}
      <div>
        <div className="flex items-center gap-2">
          {code && <span className={`tag ${TONE_CLASS[code.toLowerCase()] ?? "tag-log"}`}>{code}</span>}
          <span className="text-[15px] font-bold leading-tight">{title}</span>
        </div>
        {subtitle ? <div className="text-[11px] text-ink-faint">{subtitle}</div> : null}
      </div>
    </div>
  );
}
