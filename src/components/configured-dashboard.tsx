import { connection } from "next/server";
import { ControlRoomDashboard } from "@/components/control-room-dashboard";
import { cctvFeeds, detectionEvents } from "@/lib/cctv";
import { getCctvSourceRuntimeStatus } from "@/lib/cctv-source-adapter";
import type { DashboardView } from "@/lib/candidate-views";

export async function ConfiguredDashboard({ view = "all" }: { view?: DashboardView }) {
  await connection();
  const runtimeStatus = getCctvSourceRuntimeStatus({
    CCTV_SOURCE_MODE: process.env.CCTV_SOURCE_MODE,
    ITS_API_KEY: process.env.ITS_API_KEY,
  });
  return <ControlRoomDashboard
    initialView={view}
    initialFeeds={runtimeStatus.isRealSource ? [] : cctvFeeds}
    initialEvents={runtimeStatus.isRealSource ? [] : detectionEvents}
    initialRuntimeStatus={runtimeStatus}
  />;
}
