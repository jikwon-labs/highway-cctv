import Link from "next/link";

export function WorkspaceNavigation({ active }: { active: "all" | "candidates" | "monitor" }) {
  return <nav aria-label="관제 화면" className="flex flex-wrap border border-[#e0e0e0] bg-white text-sm">
    {([
      ["all", "/", "전체 CCTV"],
      ["candidates", "/events", "후보 감지 지점"],
      ["monitor", "/monitor", "내 모니터"],
    ] as const).map(([view, href, label]) => <Link key={view} href={href}
      aria-current={view === active ? "page" : undefined}
      className={`min-h-11 border-r border-[#e0e0e0] px-4 py-3 ${view === active ? "bg-[#edf5ff] text-[#0f62fe]" : "text-[#525252] hover:bg-[#f4f4f4]"}`}>{label}</Link>)}
  </nav>;
}
