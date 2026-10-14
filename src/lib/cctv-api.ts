import type { CctvFeed, DetectionEvent } from "./cctv";

export type CctvSourceRuntimeStatus = {
  requestedMode: "mock" | "its";
  effectiveMode: "mock" | "its";
  label: "mock 데이터" | "ITS 실제 소스";
  hasApiKey: boolean;
  isRealSource: boolean;
  notice: string;
};

export type CctvSnapshot = {
  meta: {
    source: "mock" | "its";
    generatedAt: string;
    feedCount: number;
    eventCount: number;
    runtimeStatus?: CctvSourceRuntimeStatus;
  };
  feeds: CctvFeed[];
  events: DetectionEvent[];
};

export function buildCctvSnapshot(
  feeds: CctvFeed[],
  events: DetectionEvent[],
  generatedAt = new Date(),
  source: CctvSnapshot["meta"]["source"] = "mock",
  runtimeStatus?: CctvSourceRuntimeStatus,
): CctvSnapshot {
  return {
    meta: {
      source,
      generatedAt: generatedAt.toISOString(),
      feedCount: feeds.length,
      eventCount: events.length,
      ...(runtimeStatus ? { runtimeStatus } : {}),
    },
    feeds: cloneFeeds(feeds),
    events: cloneEvents(events),
  };
}

export function getCctvSourceLabel(source: CctvSnapshot["meta"]["source"]): string {
  return source === "its" ? "ITS 실제 소스" : "mock 데이터";
}

export function mergeCctvSnapshot(
  snapshot: CctvSnapshot,
  localEvents: DetectionEvent[],
): CctvSnapshot {
  const localReviewStatusById = new Map(
    localEvents.map((event) => [event.id, event.reviewStatus]),
  );

  return {
    ...snapshot,
    feeds: cloneFeeds(snapshot.feeds),
    events: snapshot.events.map((event) => ({
      ...event,
      evidence: [...event.evidence],
      reviewStatus: localReviewStatusById.get(event.id) ?? event.reviewStatus,
    })),
  };
}

function cloneFeeds(feeds: CctvFeed[]): CctvFeed[] {
  return feeds.map((feed) => ({
    ...feed,
    coordinates: { ...feed.coordinates },
  }));
}

function cloneEvents(events: DetectionEvent[]): DetectionEvent[] {
  return events.map((event) => ({
    ...event,
    evidence: [...event.evidence],
  }));
}
