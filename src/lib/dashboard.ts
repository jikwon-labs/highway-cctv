import type { CctvFeed, DetectionEvent, FeedStatus, ReviewStatus } from "./cctv";
import { getTopPriorityEvents } from "./cctv";

export type FeedStatusFilter = "all" | FeedStatus;

export function filterFeedsByStatus(
  feeds: CctvFeed[],
  filter: FeedStatusFilter,
): CctvFeed[] {
  if (filter === "all") {
    return feeds;
  }

  return feeds.filter((feed) => feed.status === filter);
}

export function getNextSelectedFeedId(
  visibleFeeds: CctvFeed[],
  currentFeedId: string,
): string {
  if (visibleFeeds.some((feed) => feed.id === currentFeedId)) {
    return currentFeedId;
  }

  return visibleFeeds[0]?.id ?? currentFeedId;
}

export function getEventsForFeed(
  events: DetectionEvent[],
  feedId: string,
): DetectionEvent[] {
  return getTopPriorityEvents(
    events.filter((event) => event.feedId === feedId),
    events.length,
  );
}

export function updateEventReviewStatus(
  events: DetectionEvent[],
  eventId: string,
  reviewStatus: ReviewStatus,
): DetectionEvent[] {
  return events.map((event) =>
    event.id === eventId
      ? {
          ...event,
          reviewStatus,
        }
      : event,
  );
}
