import { Suspense } from "react";
import { ConfiguredDashboard } from "@/components/configured-dashboard";

export default function Home() {
  return <Suspense fallback={<main className="p-8">소스 설정 확인 중</main>}><ConfiguredDashboard /></Suspense>;
}
