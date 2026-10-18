import { describe, expect, it } from "vitest";

import { cctvFeeds } from "./cctv";
import {
  buildSourceStatusCards,
  getSourceReadinessSummary,
  sourceProfiles,
} from "./source-status";

describe("CCTV 소스 상태 도메인", () => {
  it("URL만 받은 CCTV는 영상 정상 대신 미확인으로 집계한다", () => {
    const cards = buildSourceStatusCards([{ ...cctvFeeds[0], status: "unverified" }], sourceProfiles);
    expect(cards[0].onlineFeeds).toBe(0);
    expect(cards[0].unverifiedFeeds).toBe(1);
  });
  it("소스별 피드 수, 연결 상태, 스트림 형식을 집계한다", () => {
    const cards = buildSourceStatusCards(cctvFeeds, sourceProfiles);
    const its = cards.find((card) => card.id === "its-national-traffic")!;
    const sample = cards.find((card) => card.id === "sample-validation")!;

    expect(its).toMatchObject({
      name: "ITS 국가교통정보센터",
      status: "needs_review",
      feedCount: 5,
      onlineFeeds: 4,
      degradedFeeds: 1,
      offlineFeeds: 0,
    });
    expect(its.streamTypes).toEqual(["HLS", "HTTPS HLS", "SNAPSHOT"]);
    expect(sample).toMatchObject({
      name: "샘플/검증용",
      status: "ready",
      feedCount: 1,
      offlineFeeds: 1,
    });
  });

  it("실서비스 전 소스 리스크 요약을 만든다", () => {
    const summary = getSourceReadinessSummary(buildSourceStatusCards(cctvFeeds, sourceProfiles));

    expect(summary).toEqual({
      totalSources: 2,
      readySources: 1,
      needsReviewSources: 1,
      blockedSources: 0,
      storageRestrictedSources: 1,
    });
  });
});
