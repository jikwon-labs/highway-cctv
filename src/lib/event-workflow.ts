import { getTopPriorityEvents, type DetectionEvent, type ReviewStatus } from "./cctv";
import type { ReviewHistoryEntry } from "./review-history";

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
