import { describe, expect, it } from "vitest";

import { buildCctvSnapshot, mergeCctvSnapshot } from "./cctv-api";
import { cctvFeeds, detectionEvents } from "./cctv";

describe("CCTV mock API snapshot", () => {
  it("대시보드가 바로 사용할 수 있는 피드/이벤트/메타 정보를 만든다", () => {
    const snapshot = buildCctvSnapshot(cctvFeeds, detectionEvents, new Date("2026-10-11T10:00:00.000Z"));

    expect(snapshot.meta).toEqual({
      source: "mock",
      generatedAt: "2026-10-11T10:00:00.000Z",
      feedCount: 6,
      eventCount: 4,
    });
    expect(snapshot.feeds).toHaveLength(6);
    expect(snapshot.events).toHaveLength(4);
  });

  it("API 갱신 시 기존 운영자 검토 상태를 유지한다", () => {
    const localEvents = detectionEvents.map((event) =>
      event.id === "evt-stopped-vehicle-01" ? { ...event, reviewStatus: "confirmed" as const } : event,
    );
    const remoteSnapshot = buildCctvSnapshot(cctvFeeds, detectionEvents, new Date("2026-10-11T10:00:00.000Z"));

    const merged = mergeCctvSnapshot(remoteSnapshot, localEvents);

    expect(merged.events.find((event) => event.id === "evt-stopped-vehicle-01")?.reviewStatus).toBe("confirmed");
    expect(merged.events.find((event) => event.id === "evt-wrong-way-01")?.reviewStatus).toBe("needs_review");
  });
});
