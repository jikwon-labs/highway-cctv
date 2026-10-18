import { NextResponse } from "next/server";

import {
  getConfiguredCctvSourceAdapter,
  getCctvSourceRuntimeStatus,
  redactSourceErrorMessage,
} from "@/lib/cctv-source-adapter";

import { parseCctvBounds, type NearbyBounds } from "@/lib/nearby-cctv";

export async function GET(request: Request) {
  let bounds: NearbyBounds | undefined;
  try {
    bounds = parseCctvBounds(new URL(request.url).searchParams);
  } catch {
    return NextResponse.json({ error: { message: "Invalid CCTV bounds" } }, { status: 400 });
  }
  const sourceEnv = {
    CCTV_SOURCE_MODE: process.env.CCTV_SOURCE_MODE,
    ITS_API_KEY: process.env.ITS_API_KEY,
  };
  const runtimeStatus = getCctvSourceRuntimeStatus(sourceEnv);
  const adapter = getConfiguredCctvSourceAdapter(sourceEnv, bounds);

  try {
    const snapshot = await adapter.getSnapshot();

    return NextResponse.json({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        runtimeStatus,
      },
    });
  } catch (error) {
    const message = redactSourceErrorMessage(
      error instanceof Error ? error.message : "CCTV source refresh failed",
    );

    return NextResponse.json(
      {
        error: {
          source: adapter.id,
          message,
          runtimeStatus,
        },
      },
      { status: 502 },
    );
  }
}
