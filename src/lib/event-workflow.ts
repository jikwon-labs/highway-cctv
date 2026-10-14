import { getTopPriorityEvents, type CctvFeed, type DetectionEvent, type ReviewStatus } from "./cctv";
import type { ReviewHistoryEntry } from "./review-history";

export type EventQueueFilter = "all" | "needs_review" | "critical" | "confirmed" | "dismissed";

export type EventQueueSort = "priority" | "confidence" | "latest" | "feed";

export type EventQueueSummary = Record<EventQueueFilter, number>;

export type EventTimelineItem = {
  id: string;
  timeLabel: string;
  title: string;
  description: string;
};

const reviewLabel: Record<ReviewStatus, string> = {
  needs_review: "검토 대기",
  confirmed: "확인",
  dismissed: "오탐",
};

export function getNextSelectedEventId(
  events: DetectionEvent[],
  currentEventId?: string,
): string {
  if (currentEventId && events.some((event) => event.id === currentEventId)) {
    return currentEventId;
  }

  return getTopPriorityEvents(events, 1)[0]?.id ?? "";
}

export function buildEventTimeline(
  event: DetectionEvent,
  history: ReviewHistoryEntry[],
): EventTimelineItem[] {
  const reviewSteps = history
    .filter((entry) => entry.eventId === event.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => ({
      id: entry.id,
      timeLabel: formatHistoryTime(entry.createdAt),
      title: `${reviewLabel[entry.previousStatus]} → ${reviewLabel[entry.nextStatus]}`,
      description: `${entry.operator} · ${entry.reasonNote ?? "처리 사유 없음"}`,
    }));

  return [
    {
      id: `${event.id}-detected`,
      timeLabel: event.detectedAt,
      title: "감지 후보 생성",
      description: `${event.label} · 신뢰도 ${(event.confidence * 100).toFixed(0)}%`,
    },
    ...reviewSteps,
  ];
}

export function filterEventQueue(
  events: DetectionEvent[],
  filter: EventQueueFilter,
): DetectionEvent[] {
  if (filter === "all") {
    return events;
  }

  if (filter === "critical") {
    return events.filter((event) => event.severity === "critical");
  }

  return events.filter((event) => event.reviewStatus === filter);
}

export function buildEventQueueSummary(events: DetectionEvent[]): EventQueueSummary {
  return {
    all: events.length,
    needs_review: events.filter((event) => event.reviewStatus === "needs_review").length,
    critical: events.filter((event) => event.severity === "critical").length,
    confirmed: events.filter((event) => event.reviewStatus === "confirmed").length,
    dismissed: events.filter((event) => event.reviewStatus === "dismissed").length,
  };
}

export function searchEventQueue(
  events: DetectionEvent[],
  feeds: CctvFeed[],
  query: string,
): DetectionEvent[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return events;
  }

  const feedById = new Map(feeds.map((feed) => [feed.id, feed]));

  return events.filter((event) => {
    const feed = feedById.get(event.feedId);
    const searchableText = normalizeSearchText(
      [
        event.label,
        event.type,
        event.detectedAt,
        ...event.evidence,
        feed?.name,
        feed?.route,
        feed?.direction,
        feed?.location,
      ]
        .filter(Boolean)
        .join(" "),
    );

    return searchableText.includes(normalizedQuery);
  });
}

export function sortEventQueue(
  events: DetectionEvent[],
  feeds: CctvFeed[],
  sort: EventQueueSort,
): DetectionEvent[] {
  if (sort === "priority") {
    return getTopPriorityEvents(events, events.length);
  }

  const feedById = new Map(feeds.map((feed) => [feed.id, feed]));

  return [...events].sort((a, b) => {
    if (sort === "confidence") {
      return b.confidence - a.confidence;
    }

    if (sort === "latest") {
      return b.detectedAt.localeCompare(a.detectedAt);
    }

    const feedNameDelta = (feedById.get(a.feedId)?.name ?? "").localeCompare(feedById.get(b.feedId)?.name ?? "", "ko-KR");

    if (feedNameDelta !== 0) {
      return feedNameDelta;
    }

    return b.detectedAt.localeCompare(a.detectedAt);
  });
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Seoul",
  });
}
