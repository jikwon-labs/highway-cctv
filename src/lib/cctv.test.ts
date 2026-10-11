import { describe, expect, it } from "vitest";

import {
  cctvFeeds,
  detectionEvents,
  getControlRoomSummary,
  getTopPriorityEvents,
} from "./cctv";

describe("CCTV 관제 도메인", () => {
  it("피드 상태와 이벤트 후보를 관제 요약으로 집계한다", () => {
    const summary = getControlRoomSummary(cctvFeeds, detectionEvents);

    expect(summary.totalFeeds).toBe(6);
    expect(summary.onlineFeeds).toBe(4);
    expect(summary.degradedFeeds).toBe(1);
    expect(summary.offlineFeeds).toBe(1);
    expect(summary.activeEvents).toBe(4);
    expect(summary.criticalEvents).toBe(2);
    expect(summary.needsReview).toBe(3);
  });

  it("이벤트 후보를 심각도와 신뢰도 기준으로 우선 정렬한다", () => {
    const topEvents = getTopPriorityEvents(detectionEvents, 3);

    expect(topEvents.map((event) => event.id)).toEqual([
      "evt-stopped-vehicle-01",
      "evt-wrong-way-01",
      "evt-congestion-01",
    ]);
  });
});
