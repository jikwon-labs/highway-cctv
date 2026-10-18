import { Suspense } from "react";
import { connection } from "next/server";
import { ControlRoomDashboard } from "@/components/control-room-dashboard";
import { cctvFeeds, detectionEvents } from "@/lib/cctv";
import { getCctvSourceRuntimeStatus } from "@/lib/cctv-source-adapter";

export default function Home() {
  return <Suspense fallback={<main className="p-8">소스 설정 확인 중</main>}><ConfiguredDashboard /></Suspense>;
}

async function ConfiguredDashboard() {
  await connection();
  const runtimeStatus = getCctvSourceRuntimeStatus({
    CCTV_SOURCE_MODE: process.env.CCTV_SOURCE_MODE,
    ITS_API_KEY: process.env.ITS_API_KEY,
  });
  return <ControlRoomDashboard
    initialFeeds={runtimeStatus.isRealSource ? [] : cctvFeeds}
    initialEvents={runtimeStatus.isRealSource ? [] : detectionEvents}
    initialRuntimeStatus={runtimeStatus}
  />;
}
