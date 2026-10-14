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
  reasonNote?: string;
  operator: string;
  createdAt: string;
};

export const reviewReasonOptions: Record<ReviewStatus, string[]> = {
  confirmed: ["CCTV 화면으로 확인", "반복 감지 확인", "현장 대응 필요"],
  dismissed: ["움직임 정상 흐름", "일시적 영상 노이즈", "중복 후보"],
  needs_review: ["추가 관찰 필요", "담당자 재검토", "근거 부족"],
};

export type ReviewReasonSelection = Partial<Record<ReviewStatus, string>>;

export function createReviewHistoryEntry({
  event,
  feed,
  previousStatus,
  nextStatus,
  reasonNote = getDefaultReviewReason(nextStatus),
  operator,
  createdAt,
}: {
  event: DetectionEvent;
  feed: CctvFeed;
  previousStatus: ReviewStatus;
  nextStatus: ReviewStatus;
  reasonNote?: string;
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
    reasonNote,
    operator,
    createdAt,
  };
}

export function getDefaultReviewReason(status: ReviewStatus): string {
  return reviewReasonOptions[status][0];
}

export function getReviewReasonOptions(status: ReviewStatus): string[] {
  return [...reviewReasonOptions[status]];
}

export function getSelectedReviewReason(
  selectedReasons: ReviewReasonSelection | undefined,
  status: ReviewStatus,
): string {
  const selectedReason = selectedReasons?.[status];

  if (selectedReason && reviewReasonOptions[status].includes(selectedReason)) {
    return selectedReason;
  }

  return getDefaultReviewReason(status);
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

export function exportReviewHistoryAsJson(history: ReviewHistoryEntry[]): string {
  return JSON.stringify(history, null, 2);
}

export function exportReviewHistoryAsCsv(history: ReviewHistoryEntry[]): string {
  const header = [
    "createdAt",
    "eventId",
    "eventLabel",
    "feedId",
    "feedName",
    "previousStatus",
    "nextStatus",
    "reasonNote",
    "operator",
  ];

  return [
    header.join(","),
    ...history.map((entry) =>
      [
        entry.createdAt,
        entry.eventId,
        entry.eventLabel,
        entry.feedId,
        entry.feedName,
        entry.previousStatus,
        entry.nextStatus,
        entry.reasonNote ?? "",
        entry.operator,
      ]
        .map(escapeCsvValue)
        .join(","),
    ),
  ].join("\n");
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
    (entry.reasonNote === undefined || typeof entry.reasonNote === "string") &&
    typeof entry.operator === "string" &&
    typeof entry.createdAt === "string"
  );
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "needs_review" || value === "confirmed" || value === "dismissed";
}

function escapeCsvValue(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
