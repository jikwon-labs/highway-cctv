import Link from "next/link";
import { MonitorWall } from "@/components/monitor-wall";

export default function MonitorPage() {
  return (
    <main className="min-h-screen bg-[#f4f4f4] text-[#161616]">
      <header className="border-b border-[#c6c6c6] bg-white px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Link href="/" className="font-medium">Highway CCTV</Link>
          <nav aria-label="주 메뉴" className="flex flex-wrap gap-5 text-sm">
            <Link href="/" className="text-[#525252] hover:underline">관제</Link>
            <Link href="/events" className="text-[#525252] hover:underline">감지 후보</Link>
            <Link href="/monitor" aria-current="page" className="text-[#0f62fe] underline">모니터 벽</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8"><MonitorWall /></div>
    </main>
  );
}
