import { describe, expect, it } from "vitest";

import { cctvFeeds, detectionEvents } from "./cctv";
import {
  filterFeedsByStatus,
  getEventsForFeed,
  getNextSelectedFeedId,
  updateEventReviewStatus,
} from "./dashboard";

describe("관제 대시보드 상호작용 도메인", () => {
  it("상태 필터에 맞는 CCTV 피드만 보여준다", () => {
    expect(filterFeedsByStatus(cctvFeeds, "all")).toHaveLength(6);
    expect(filterFeedsByStatus(cctvFeeds, "online")).toHaveLength(4);
    expect(filterFeedsByStatus(cctvFeeds, "degraded").map((feed) => feed.id)).toEqual([
      "feed-yeongdong-yongin",
    ]);
  });

  it("선택한 피드가 필터 결과에 없으면 첫 번째 피드로 선택을 보정한다", () => {
    const degradedFeeds = filterFeedsByStatus(cctvFeeds, "degraded");

    expect(getNextSelectedFeedId(degradedFeeds, "feed-gyeongbu-seoul-tg")).toBe(
      "feed-yeongdong-yongin",
    );
  });

  it("선택한 피드의 이벤트만 우선순위 정렬로 가져온다", () => {
    const events = getEventsForFeed(detectionEvents, "feed-gyeongbu-seoul-tg");

    expect(events.map((event) => event.id)).toEqual(["evt-stopped-vehicle-01"]);
  });

  it("이벤트 검토 상태를 불변 업데이트한다", () => {
    const updated = updateEventReviewStatus(
      detectionEvents,
      "evt-stopped-vehicle-01",
      "confirmed",
    );

    expect(updated).not.toBe(detectionEvents);
    expect(updated.find((event) => event.id === "evt-stopped-vehicle-01")?.reviewStatus).toBe(
      "confirmed",
    );
    expect(detectionEvents.find((event) => event.id === "evt-stopped-vehicle-01")?.reviewStatus).toBe(
      "needs_review",
    );
  });
});
