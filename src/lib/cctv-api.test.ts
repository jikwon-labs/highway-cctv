import { describe, expect, it } from "vitest";

import { buildCctvSnapshot, getCctvSourceLabel, mergeCctvSnapshot } from "./cctv-api";
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

  it("실제/mock 런타임 상태를 snapshot meta에 함께 담을 수 있다", () => {
    const snapshot = buildCctvSnapshot(cctvFeeds, detectionEvents, new Date("2026-10-11T10:00:00.000Z"), "mock", {
      requestedMode: "its",
      effectiveMode: "mock",
      label: "mock 데이터",
      hasApiKey: false,
      isRealSource: false,
      notice: "ITS 모드가 요청됐지만 API 키가 없어 mock 데이터로 폴백했습니다.",
    });

    expect(snapshot.meta.runtimeStatus).toEqual({
      requestedMode: "its",
      effectiveMode: "mock",
      label: "mock 데이터",
      hasApiKey: false,
      isRealSource: false,
      notice: "ITS 모드가 요청됐지만 API 키가 없어 mock 데이터로 폴백했습니다.",
    });
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

  it("대시보드에 표시할 소스 라벨을 만든다", () => {
    expect(getCctvSourceLabel("mock")).toBe("mock 데이터");
    expect(getCctvSourceLabel("its")).toBe("ITS 실제 소스");
  });
});
