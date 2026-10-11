import { describe, expect, it } from "vitest";

import { cctvFeeds, detectionEvents } from "./cctv";
import { buildEventQueueSummary, buildEventTimeline, filterEventQueue, getNextSelectedEventId } from "./event-workflow";
import { createReviewHistoryEntry } from "./review-history";

describe("이벤트 상세/타임라인 도메인", () => {
  it("선택한 이벤트가 없거나 사라지면 우선순위 첫 이벤트로 보정한다", () => {
    expect(getNextSelectedEventId(detectionEvents, undefined)).toBe("evt-stopped-vehicle-01");
    expect(getNextSelectedEventId(detectionEvents, "missing-event")).toBe("evt-stopped-vehicle-01");
    expect(getNextSelectedEventId(detectionEvents, "evt-congestion-01")).toBe("evt-congestion-01");
  });

  it("감지 시점과 검토 이력을 시간순 타임라인으로 만든다", () => {
    const event = detectionEvents[0];
    const feed = cctvFeeds[0];
    const history = [
      createReviewHistoryEntry({
        event,
        feed,
        previousStatus: "confirmed",
        nextStatus: "dismissed",
        reasonNote: "중복 후보",
        operator: "운영자",
        createdAt: "2026-10-11T10:22:00.000Z",
      }),
      createReviewHistoryEntry({
        event,
        feed,
        previousStatus: "needs_review",
        nextStatus: "confirmed",
        reasonNote: "CCTV 화면으로 확인",
        operator: "운영자",
        createdAt: "2026-10-11T10:20:00.000Z",
      }),
    ];

    expect(buildEventTimeline(event, history)).toEqual([
      {
        id: "evt-stopped-vehicle-01-detected",
        timeLabel: "18:39:24",
        title: "감지 후보 생성",
        description: "정지 차량 후보 · 신뢰도 91%",
      },
      {
        id: "evt-stopped-vehicle-01-2026-10-11T10:20:00.000Z-confirmed",
        timeLabel: "오후 07:20:00",
        title: "검토 대기 → 확인",
        description: "운영자 · CCTV 화면으로 확인",
      },
      {
        id: "evt-stopped-vehicle-01-2026-10-11T10:22:00.000Z-dismissed",
        timeLabel: "오후 07:22:00",
        title: "확인 → 오탐",
        description: "운영자 · 중복 후보",
      },
    ]);
  });

  it("운영 큐 필터로 검토 대기/긴급/전체 이벤트를 나눈다", () => {
    expect(filterEventQueue(detectionEvents, "all")).toHaveLength(4);
    expect(filterEventQueue(detectionEvents, "needs_review").map((event) => event.id)).toEqual([
      "evt-stopped-vehicle-01",
      "evt-wrong-way-01",
      "evt-congestion-01",
    ]);
    expect(filterEventQueue(detectionEvents, "critical").map((event) => event.id)).toEqual([
      "evt-stopped-vehicle-01",
      "evt-wrong-way-01",
    ]);
  });

  it("운영 큐 탭에 표시할 건수를 만든다", () => {
    expect(buildEventQueueSummary(detectionEvents)).toEqual({
      all: 4,
      needs_review: 3,
      critical: 2,
      confirmed: 1,
      dismissed: 0,
    });
  });
});
