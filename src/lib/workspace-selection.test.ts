import { describe, expect, it } from "vitest";
import { cctvFeeds, detectionEvents } from "./cctv";
import { selectFeedWorkspace, selectEventWorkspace, getFeedEventMarker, layoutMapMarkers, reconcileWorkspaceSelection, type WorkspaceSelection } from "./workspace-selection";

describe("갱신 후 최신 작업 영역 선택 유지", () => {
  it.each([{ feeds: cctvFeeds }, { feeds: [] }])("현재 지점 자체가 사라지면 새 snapshot의 첫 지점 또는 빈 선택으로 보정한다", ({ feeds }) => {
    expect(reconcileWorkspaceSelection(feeds, detectionEvents, {
      feedId: "removed-feed", eventId: "",
    })).toEqual(feeds.length ? {
      feedId: "feed-gyeongbu-seoul-tg", eventId: "evt-stopped-vehicle-01",
    } : { feedId: "", eventId: "" });
  });

  it("후보가 없던 지점에 새 후보가 생겨도 명시적인 후보 미선택을 보존한다", () => {
    const current = { feedId: "feed-jungbu-hanam", eventId: "" };
    const events = [{ ...detectionEvents[0], feedId: current.feedId }];
    expect(reconcileWorkspaceSelection(cctvFeeds, events, current)).toEqual(current);
  });

  it("현재 후보가 사라지고 같은 지점에 대체 후보가 없으면 후보만 해제한다", () => {
    expect(reconcileWorkspaceSelection(cctvFeeds, [], {
      feedId: "feed-yeongdong-yongin", eventId: "evt-congestion-01",
    })).toEqual({ feedId: "feed-yeongdong-yongin", eventId: "" });
  });

  it("새 snapshot 전체에 남은 최신 지점과 유효한 후보는 상태나 우선순위가 달라도 보존한다", () => {
    const current = { feedId: "feed-yeongdong-yongin", eventId: "evt-congestion-01" };
    const feeds = cctvFeeds.map((feed) => feed.id === current.feedId ? { ...feed, status: "offline" as const } : feed);
    const events = [
      ...detectionEvents,
      { ...detectionEvents[0], id: "new-priority-event", feedId: current.feedId },
    ];
    expect(reconcileWorkspaceSelection(feeds, events, current)).toEqual(current);
  });
  it.each(["removed-event", "evt-stopped-vehicle-01"])("사라지거나 다른 지점으로 이동한 후보 %s만 현재 지점에서 보정한다", (eventId) => {
    expect(reconcileWorkspaceSelection(cctvFeeds, detectionEvents, {
      feedId: "feed-yeongdong-yongin", eventId,
    })).toEqual({ feedId: "feed-yeongdong-yongin", eventId: "evt-congestion-01" });
  });
  it("응답을 기다리는 동안 이동한 지점과 후보를 성공 시점의 선택으로 보존한다", async () => {
    let selection: WorkspaceSelection = {
      feedId: "feed-gyeongbu-seoul-tg", eventId: "evt-stopped-vehicle-01",
    };
    let release!: () => void;
    const pendingResponse = new Promise<void>((resolve) => { release = resolve; });
    const refresh = pendingResponse.then(() => {
      expect(reconcileWorkspaceSelection).toBeTypeOf("function");
      // A functional state update reads the selection at response completion.
      selection = reconcileWorkspaceSelection(cctvFeeds, detectionEvents, selection);
    });

    selection = selectFeedWorkspace(cctvFeeds, detectionEvents, "feed-yeongdong-yongin")!;
    release();
    await refresh;

    expect(selection).toEqual({
      feedId: "feed-yeongdong-yongin", eventId: "evt-congestion-01",
    });
  });
});

describe("지도·영상·이벤트 선택 연동", () => {
  it("개략 지도에서 가까운 지점의 클릭 영역이 겹치지 않도록 배치한다", () => {
    for (const feeds of [cctvFeeds, cctvFeeds.map((feed) => ({ ...feed, coordinates: cctvFeeds[0].coordinates }))]) {
      const points = Object.values(layoutMapMarkers(feeds));
      expect(points).toHaveLength(feeds.length);
      expect(points.every((point) => point.x >= 8 && point.x <= 92 && point.y >= 8 && point.y <= 92)).toBe(true);
      expect(points.every((point, i) => points.slice(i + 1).every((other) => Math.abs(point.x - other.x) >= 46 || Math.abs(point.y - other.y) >= 19))).toBe(true);
    }
    expect(layoutMapMarkers([])).toEqual({});
  });
  it("CCTV 선택 시 같은 지점의 검토 대기 후보를 우선 선택한다", () => {
    expect(selectFeedWorkspace(cctvFeeds, detectionEvents, "feed-yeongdong-yongin")).toEqual({
      feedId: "feed-yeongdong-yongin", eventId: "evt-congestion-01",
    });
    const events = [
      { ...detectionEvents[0], reviewStatus: "confirmed" as const },
      { ...detectionEvents[2], feedId: cctvFeeds[0].id },
    ];
    expect(selectFeedWorkspace(cctvFeeds, events, cctvFeeds[0].id)?.eventId).toBe("evt-congestion-01");
  });

  it("후보가 없는 지점은 이전 후보를 남기지 않고 해제한다", () => {
    expect(selectFeedWorkspace(cctvFeeds, detectionEvents, "feed-jungbu-hanam")).toEqual({
      feedId: "feed-jungbu-hanam", eventId: "",
    });
    expect(selectFeedWorkspace(cctvFeeds, detectionEvents, "missing")).toBeUndefined();
  });

  it("이벤트 선택 시 연결 CCTV를 함께 선택하며 유실된 참조는 거부한다", () => {
    expect(selectEventWorkspace(cctvFeeds, detectionEvents, "evt-wrong-way-01")).toEqual({
      feedId: "feed-gyeongbu-pangyo", eventId: "evt-wrong-way-01",
    });
    expect(selectEventWorkspace([], detectionEvents, "evt-wrong-way-01")).toBeUndefined();
    expect(selectEventWorkspace(cctvFeeds, detectionEvents, "missing")).toBeUndefined();
  });

  it("지도는 오탐을 제외한 후보 건수·최고 긴급도·검토 건수를 구분한다", () => {
    expect(getFeedEventMarker(detectionEvents, cctvFeeds[0].id)).toEqual({ count: 1, needsReview: 1, severity: "critical" });
    expect(getFeedEventMarker(detectionEvents, "feed-seohaean-maesong")).toEqual({ count: 1, needsReview: 0, severity: "warning" });
    expect(getFeedEventMarker([{ ...detectionEvents[0], reviewStatus: "dismissed" }], cctvFeeds[0].id)).toEqual({ count: 0, needsReview: 0, severity: undefined });
    expect(getFeedEventMarker([], cctvFeeds[0].id).count).toBe(0);
  });
});
