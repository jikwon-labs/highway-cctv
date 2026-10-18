import type { CctvFeed, DetectionEvent } from "./cctv";

export type DashboardView = "all" | "candidates";

export function filterCandidateEvents(feeds: CctvFeed[], events: DetectionEvent[]): DetectionEvent[] {
  const feedIds = new Set(feeds.map(feed => feed.id));
  return events.filter(event => event.reviewStatus !== "dismissed" && feedIds.has(event.feedId));
}

export function filterCandidateFeeds(feeds: CctvFeed[], events: DetectionEvent[]): CctvFeed[] {
  const eventFeedIds = new Set(events.filter(event => event.reviewStatus !== "dismissed").map(event => event.feedId));
  return feeds.filter(feed => eventFeedIds.has(feed.id));
}
