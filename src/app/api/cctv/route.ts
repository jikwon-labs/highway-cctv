import { NextResponse } from "next/server";

import { getConfiguredCctvSourceAdapter } from "@/lib/cctv-source-adapter";

export async function GET() {
  const adapter = getConfiguredCctvSourceAdapter({
    CCTV_SOURCE_MODE: process.env.CCTV_SOURCE_MODE,
    ITS_API_KEY: process.env.ITS_API_KEY,
  });
  const snapshot = await adapter.getSnapshot();

  return NextResponse.json(snapshot);
}
