import { describe, expect, it } from "vitest";

import { cctvFeeds, detectionEvents } from "./cctv";
import {
  applyReviewHistoryToEvents,
  createReviewHistoryEntry,
  getDefaultReviewReason,
  parseReviewHistory,
  reviewReasonOptions,
  serializeReviewHistory,
} from "./review-history";

describe("이벤트 검토 이력 도메인", () => {
  it("이벤트 검토 변경을 감사 이력 항목으로 만든다", () => {
    const event = detectionEvents.find((item) => item.id === "evt-stopped-vehicle-01")!;
    const feed = cctvFeeds.find((item) => item.id === event.feedId)!;
    const entry = createReviewHistoryEntry({
      event,
      feed,
      previousStatus: "needs_review",
      nextStatus: "confirmed",
      reasonNote: "CCTV 화면으로 정지 차량 확인",
      operator: "운영자",
      createdAt: "2026-10-11T10:20:00.000Z",
    });

    expect(entry).toEqual({
      id: "evt-stopped-vehicle-01-2026-10-11T10:20:00.000Z-confirmed",
      eventId: "evt-stopped-vehicle-01",
      eventLabel: "정지 차량 후보",
      feedId: "feed-gyeongbu-seoul-tg",
      feedName: "서울요금소",
      previousStatus: "needs_review",
      nextStatus: "confirmed",
      reasonNote: "CCTV 화면으로 정지 차량 확인",
      operator: "운영자",
      createdAt: "2026-10-11T10:20:00.000Z",
    });
  });

  it("검토 상태별 기본 처리 사유를 제공한다", () => {
    expect(reviewReasonOptions.confirmed).toContain("CCTV 화면으로 확인");
    expect(reviewReasonOptions.dismissed).toContain("움직임 정상 흐름");
    expect(reviewReasonOptions.needs_review).toContain("추가 관찰 필요");
    expect(getDefaultReviewReason("confirmed")).toBe("CCTV 화면으로 확인");
  });

  it("가장 최근 검토 이력으로 이벤트 상태를 복원한다", () => {
    const firstEntry = createReviewHistoryEntry({
      event: detectionEvents[0],
      feed: cctvFeeds[0],
      previousStatus: "needs_review",
      nextStatus: "confirmed",
      operator: "운영자",
      createdAt: "2026-10-11T10:20:00.000Z",
    });
    const secondEntry = createReviewHistoryEntry({
      event: detectionEvents[0],
      feed: cctvFeeds[0],
      previousStatus: "confirmed",
      nextStatus: "dismissed",
      operator: "운영자",
      createdAt: "2026-10-11T10:21:00.000Z",
    });

    const restored = applyReviewHistoryToEvents(detectionEvents, [firstEntry, secondEntry]);

    expect(restored.find((event) => event.id === detectionEvents[0].id)?.reviewStatus).toBe("dismissed");
  });

  it("브라우저 저장소 직렬화 값을 안전하게 파싱한다", () => {
    const entry = createReviewHistoryEntry({
      event: detectionEvents[1],
      feed: cctvFeeds[1],
      previousStatus: "needs_review",
      nextStatus: "confirmed",
      operator: "운영자",
      createdAt: "2026-10-11T10:22:00.000Z",
    });

    expect(parseReviewHistory(serializeReviewHistory([entry]))).toEqual([entry]);
    expect(parseReviewHistory("not-json")).toEqual([]);
    expect(parseReviewHistory(JSON.stringify([{ eventId: "missing-fields" }]))).toEqual([]);
  });
});
