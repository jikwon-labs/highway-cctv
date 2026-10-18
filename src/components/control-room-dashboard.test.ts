import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReviewHistoryEntry, serializeReviewHistory } from "@/lib/review-history";
import { ControlRoomDashboard } from "./control-room-dashboard";
import { cctvFeeds, detectionEvents, type CctvFeed, type DetectionEvent, type ReviewStatus } from "@/lib/cctv";

// Keep only dashboard hook state between renders; children still use real React SSR.
// This exercises the real review callback without adding a DOM/test-renderer dependency.
const dashboardHooks = vi.hoisted(() => ({ active: false, cursor: 0, states: [] as unknown[] }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      if (!dashboardHooks.active) return actual.useState(initial);
      const index = dashboardHooks.cursor++;
      if (!(index in dashboardHooks.states)) {
        dashboardHooks.states[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      return [dashboardHooks.states[index] as T, (update: T | ((previous: T) => T)) => {
        dashboardHooks.states[index] = typeof update === "function"
          ? (update as (previous: T) => T)(dashboardHooks.states[index] as T) : update;
      }];
    },
    useMemo: <T,>(factory: () => T, dependencies: import("react").DependencyList) =>
      dashboardHooks.active ? factory() : actual.useMemo(factory, dependencies),
    useSyncExternalStore: (...args: Parameters<typeof actual.useSyncExternalStore>) =>
      dashboardHooks.active ? args[1]() : actual.useSyncExternalStore(...args),
  };
});

vi.mock("./use-nearby-cctv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-nearby-cctv")>();
  return { ...actual, useNearbyCctv: (options: Parameters<typeof actual.useNearbyCctv>[0]) => dashboardHooks.active
    ? { status: "idle", message: "", isRefreshing: false, apiStatus: options.initialApiStatus, position: undefined, onRefresh: vi.fn(), onLocate: vi.fn(), onClear: options.onClear }
    : actual.useNearbyCctv(options) };
});

function renderDashboard(props: Parameters<typeof ControlRoomDashboard>[0]) {
  dashboardHooks.cursor = 0;
  dashboardHooks.active = true;
  try { return ControlRoomDashboard(props); }
  finally { dashboardHooks.active = false; }
}

function findProps<T>(node: ReactNode, property: string): T {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (Object.hasOwn(child.props, property)) return child.props as T;
    const found = findProps<T | undefined>(child.props.children, property);
    if (found) return found;
  }
  return undefined as T;
}

afterEach(() => {
  dashboardHooks.active = false;
  dashboardHooks.states = [];
  vi.unstubAllGlobals();
});

describe("선택 후보 오탐 처리 상태 전이", () => {
  it.each(["candidates", "all"] as const)("%s 화면은 같은 CCTV의 오탐 상세 범위를 지킨다", (initialView) => {
    const feed = cctvFeeds[0];
    const candidateA = { ...detectionEvents[0], id: "same-feed-a" };
    const candidateB = { ...candidateA, id: "same-feed-b", label: "같은 CCTV의 다른 후보" };
    const props = { initialFeeds: [feed], initialEvents: [candidateA, candidateB], initialView };
    let stored: string | null = null;
    vi.stubGlobal("window", {
      localStorage: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } },
      dispatchEvent: vi.fn(),
    });
    type WorkspaceProps = { feed: CctvFeed; events: DetectionEvent[]; selectedEvent?: DetectionEvent };
    type ReviewProps = { onReview: (eventId: string, status: ReviewStatus) => void };

    const before = renderDashboard(props);
    expect(findProps<WorkspaceProps>(before, "feed").selectedEvent?.id).toBe(candidateA.id);
    expect(renderToStaticMarkup(before)).toContain('data-event-id="same-feed-a"');
    findProps<ReviewProps>(before, "onReview").onReview(candidateA.id, "dismissed");

    const after = renderDashboard(props);
    const workspace = findProps<WorkspaceProps>(after, "feed");
    const html = renderToStaticMarkup(after);
    expect(workspace.feed.id).toBe(feed.id);
    expect(workspace.events.find((event) => event.id === candidateB.id)?.reviewStatus).toBe("needs_review");
    expect(stored).toContain('"nextStatus":"dismissed"');
    if (initialView === "candidates") {
      expect(workspace.events.map((event) => event.id)).toEqual([candidateB.id]);
      expect(workspace.selectedEvent?.id).not.toBe(candidateA.id);
      expect(html).not.toContain('data-event-id="same-feed-a"');
    } else {
      expect(workspace.selectedEvent?.reviewStatus).toBe("dismissed");
      expect(html).toContain('data-event-id="same-feed-a"');
    }
  });
});

describe("후보 감지 지점 전용 관제", () => {
  it("서버/첫 hydration 렌더는 저장된 검토 이력을 직접 읽지 않는다", () => {
    const stored = serializeReviewHistory([createReviewHistoryEntry({
      event: detectionEvents[0], feed: cctvFeeds[0], previousStatus: "needs_review", nextStatus: "dismissed",
      reasonNote: "일시적 영상 노이즈", operator: "운영자", createdAt: "2026-10-18T10:00:00.000Z",
    })]);
    const getItem = vi.fn(() => stored);
    vi.stubGlobal("window", { localStorage: { getItem } });
    const html = renderToStaticMarkup(createElement(ControlRoomDashboard, {
      initialFeeds: cctvFeeds, initialEvents: detectionEvents, initialView: "candidates",
    }));
    expect(getItem).not.toHaveBeenCalled();
    expect(html).toContain("서울요금소");
  });
  it("후보가 없는 CCTV를 목록·지도·작업 영역에서 제외한다", () => {
    const html = renderToStaticMarkup(createElement(ControlRoomDashboard, {
      initialFeeds: cctvFeeds, initialEvents: detectionEvents, initialView: "candidates",
    }));
    expect(html).toContain("후보 감지 지점");
    expect(html).not.toContain("하남 JC");
    expect(html).not.toContain("터널 샘플");
    expect(html).toContain("서울요금소");
    expect(html).toContain("CCTV 도로 지도");
    expect(html).toContain("모니터에 추가");
    expect(html).toContain("위치 동의하고 주변 보기");
    expect(html).not.toContain("좌표 기반 개략도");
  });
  it("후보가 모두 오탐이면 다른 지점 영상으로 대체하지 않는다", () => {
    const html = renderToStaticMarkup(createElement(ControlRoomDashboard, {
      initialFeeds: cctvFeeds,
      initialEvents: detectionEvents.map(e=>({...e,reviewStatus:"dismissed" as const})),
      initialView:"candidates",
    }));
    expect(html).toContain("감지 후보가 있는 지점이 없습니다");
    expect(html).not.toContain("서울요금소");
  });
});
