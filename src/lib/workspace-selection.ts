import type { CctvFeed, DetectionEvent, EventSeverity } from "./cctv";
import { getEventsForFeed, normalizeFeedToMap, type MapPoint } from "./dashboard";

// Small schematic overview only. Move labels slightly, not the stored coordinates.
export function layoutMapMarkers(feeds: CctvFeed[]): Record<string, MapPoint> {
  const placed: MapPoint[] = [];
  const points: Record<string, MapPoint> = {};
  for (const feed of feeds) {
    const origin = normalizeFeedToMap(feeds, feed);
    const candidates = [origin, ...[8, 92].flatMap((x) => [8, 29, 50, 71, 92].map((y) => ({ x, y })))];
    candidates.sort((a, b) => (a.x - origin.x) ** 2 + (a.y - origin.y) ** 2 - ((b.x - origin.x) ** 2 + (b.y - origin.y) ** 2));
    const point = candidates.find((candidate) => placed.every((other) =>
      Math.abs(candidate.x - other.x) >= 46 || Math.abs(candidate.y - other.y) >= 19,
    )) ?? origin;
    points[feed.id] = point;
    placed.push(point);
  }
  return points;
}

export type WorkspaceSelection = { feedId: string; eventId: string };

export function reconcileWorkspaceSelection(
  feeds: CctvFeed[], events: DetectionEvent[], current: WorkspaceSelection,
): WorkspaceSelection {
  if (!feeds.some((feed) => feed.id === current.feedId)) {
    return selectFeedWorkspace(feeds, events, feeds[0]?.id ?? "") ?? { feedId: "", eventId: "" };
  }
  if (!current.eventId || events.some((event) => event.id === current.eventId && event.feedId === current.feedId)) {
    return current;
  }
  return selectFeedWorkspace(feeds, events, current.feedId) ?? { feedId: current.feedId, eventId: "" };
}

export function selectFeedWorkspace(
  feeds: CctvFeed[], events: DetectionEvent[], feedId: string,
): WorkspaceSelection | undefined {
  if (!feeds.some((feed) => feed.id === feedId)) return undefined;

  const candidates = getEventsForFeed(events, feedId).filter((event) => event.reviewStatus !== "dismissed");
  const event = candidates.find((candidate) => candidate.reviewStatus === "needs_review") ?? candidates[0];
  return { feedId, eventId: event?.id ?? "" };
}

export function selectEventWorkspace(
  feeds: CctvFeed[], events: DetectionEvent[], eventId: string,
): WorkspaceSelection | undefined {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event || !feeds.some((feed) => feed.id === event.feedId)) return undefined;
  return { feedId: event.feedId, eventId };
}

export function getFeedEventMarker(events: DetectionEvent[], feedId: string): {
  count: number; needsReview: number; severity: EventSeverity | undefined;
} {
  const candidates = getEventsForFeed(events, feedId).filter((event) => event.reviewStatus !== "dismissed");
  return {
    count: candidates.length,
    needsReview: candidates.filter((event) => event.reviewStatus === "needs_review").length,
    severity: candidates[0]?.severity,
  };
}
