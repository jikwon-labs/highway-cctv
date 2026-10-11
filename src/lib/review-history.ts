import type { CctvFeed, DetectionEvent, ReviewStatus } from "./cctv";

export const reviewHistoryStorageKey = "highway-cctv.review-history.v1";

export type ReviewHistoryEntry = {
  id: string;
  eventId: string;
  eventLabel: string;
  feedId: string;
  feedName: string;
  previousStatus: ReviewStatus;
  nextStatus: ReviewStatus;
  operator: string;
  createdAt: string;
};

export function createReviewHistoryEntry({
  event,
  feed,
  previousStatus,
  nextStatus,
  operator,
  createdAt,
}: {
  event: DetectionEvent;
  feed: CctvFeed;
  previousStatus: ReviewStatus;
  nextStatus: ReviewStatus;
  operator: string;
  createdAt: string;
}): ReviewHistoryEntry {
  return {
    id: `${event.id}-${createdAt}-${nextStatus}`,
    eventId: event.id,
    eventLabel: event.label,
    feedId: feed.id,
    feedName: feed.name,
    previousStatus,
    nextStatus,
    operator,
    createdAt,
  };
}

export function applyReviewHistoryToEvents(
  events: DetectionEvent[],
  history: ReviewHistoryEntry[],
): DetectionEvent[] {
  const latestStatusByEventId = new Map<string, ReviewStatus>();

  [...history]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((entry) => {
      latestStatusByEventId.set(entry.eventId, entry.nextStatus);
    });

  return events.map((event) => {
    const reviewStatus = latestStatusByEventId.get(event.id);

    if (!reviewStatus) {
      return event;
    }

    return {
      ...event,
      reviewStatus,
    };
  });
}

export function serializeReviewHistory(history: ReviewHistoryEntry[]): string {
  return JSON.stringify(history);
}

export function parseReviewHistory(rawValue: string | null): ReviewHistoryEntry[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isReviewHistoryEntry);
  } catch {
    return [];
  }
}

function isReviewHistoryEntry(value: unknown): value is ReviewHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<ReviewHistoryEntry>;

  return (
    typeof entry.id === "string" &&
    typeof entry.eventId === "string" &&
    typeof entry.eventLabel === "string" &&
    typeof entry.feedId === "string" &&
    typeof entry.feedName === "string" &&
    isReviewStatus(entry.previousStatus) &&
    isReviewStatus(entry.nextStatus) &&
    typeof entry.operator === "string" &&
    typeof entry.createdAt === "string"
  );
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "needs_review" || value === "confirmed" || value === "dismissed";
}
