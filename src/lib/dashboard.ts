import type { CctvFeed, DetectionEvent, FeedStatus, ReviewStatus } from "./cctv";
import { getTopPriorityEvents } from "./cctv";

export type FeedStatusFilter = "all" | FeedStatus;

export type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type MapPoint = {
  x: number;
  y: number;
};

const mapPaddingPercent = 8;

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

export function getMapBounds(feeds: CctvFeed[]): MapBounds {
  const lats = feeds.map((feed) => feed.coordinates.lat);
  const lngs = feeds.map((feed) => feed.coordinates.lng);

  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

export function normalizeFeedToMap(feeds: CctvFeed[], feed: CctvFeed): MapPoint {
  const bounds = getMapBounds(feeds);
  const usableRange = 100 - mapPaddingPercent * 2;
  const latRange = bounds.maxLat - bounds.minLat;
  const lngRange = bounds.maxLng - bounds.minLng;

  const xRatio = lngRange === 0 ? 0.5 : (feed.coordinates.lng - bounds.minLng) / lngRange;
  const yRatio = latRange === 0 ? 0.5 : (bounds.maxLat - feed.coordinates.lat) / latRange;

  return {
    x: roundMapPercent(mapPaddingPercent + xRatio * usableRange),
    y: roundMapPercent(mapPaddingPercent + yRatio * usableRange),
  };
}

function roundMapPercent(value: number): number {
  return Math.round(value * 10) / 10;
}
