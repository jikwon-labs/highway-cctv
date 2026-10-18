import { describe, expect, it } from "vitest";
import { cctvFeeds, detectionEvents } from "./cctv";
import { filterCandidateFeeds, filterCandidateEvents } from "./candidate-views";

describe("후보 감지 지점 화면", () => {
  it("오탐을 제외한 후보가 있는 지점만 입력 순서대로 한 번씩 보여준다", () => {
    expect(filterCandidateFeeds(cctvFeeds, detectionEvents).map(f => f.id)).toEqual(cctvFeeds.slice(0,4).map(f => f.id));
    const events = detectionEvents.map(e => ({ ...e, reviewStatus: "dismissed" as const }));
    expect(filterCandidateFeeds(cctvFeeds, events)).toEqual([]);
    expect(filterCandidateFeeds(cctvFeeds, [...detectionEvents, detectionEvents[0]])).toHaveLength(4);
  });
  it("감지 지점 큐도 오탐과 유실된 지점 후보를 제외한다", () => {
    expect(filterCandidateEvents([cctvFeeds[0]], detectionEvents).map(e=>e.id)).toEqual(["evt-stopped-vehicle-01"]);
    expect(filterCandidateEvents([], detectionEvents)).toEqual([]);
  });
});
