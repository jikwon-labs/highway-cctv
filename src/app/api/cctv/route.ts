import { NextResponse } from "next/server";

import { buildCctvSnapshot } from "@/lib/cctv-api";
import { cctvFeeds, detectionEvents } from "@/lib/cctv";

export function GET() {
  return NextResponse.json(buildCctvSnapshot(cctvFeeds, detectionEvents));
}
