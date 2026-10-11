import { ControlRoomDashboard } from "@/components/control-room-dashboard";
import { cctvFeeds, detectionEvents } from "@/lib/cctv";

export default function Home() {
  return <ControlRoomDashboard initialFeeds={cctvFeeds} initialEvents={detectionEvents} />;
}
