import type { CctvFeed } from "./cctv";

export function sortFeedsByDistance(feeds: readonly CctvFeed[], position: GeoPosition): CctvFeed[] {
  if (!isKoreaPosition(position)) throw new Error("Invalid nearby position");
  return feeds.filter((feed) => isKoreaPosition(feed.coordinates))
    .map((feed, index) => ({ feed, index, distance: distanceKm(position, feed.coordinates) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ feed }) => feed);
}

export type GeoPosition = { lat: number; lng: number };

/** Straight-line great-circle distance, not distance along a highway. */
export function distanceKm(a: GeoPosition, b: GeoPosition): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export type NearbyBounds = { minX: number; maxX: number; minY: number; maxY: number };

const boundNames = ["minX", "maxX", "minY", "maxY"] as const;

export function buildNearbyQuery(bounds: NearbyBounds): string {
  const query = new URLSearchParams(boundNames.map((name) => [name, String(bounds[name])]));
  parseCctvBounds(query);
  return `/api/cctv?${query}`;
}

export function parseCctvBounds(searchParams: URLSearchParams): NearbyBounds | undefined {
  if (searchParams.size === 0) return undefined;
  const invalid = () => { throw new Error("Invalid CCTV bounds"); };
  if (searchParams.size !== boundNames.length) invalid();
  const values = boundNames.map((name) => {
    const value = searchParams.get(name);
    if (value === null || !/^\d+(?:\.\d{1,2})?$/.test(value)) return invalid();
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number * 20 - Math.round(number * 20)) > 1e-9) return invalid();
    return number;
  });
  const [minX, maxX, minY, maxY] = values;
  if (!isKoreaPosition({ lat: minY, lng: minX }) || !isKoreaPosition({ lat: maxY, lng: maxX })
    || minX >= maxX || minY >= maxY || maxX - minX > 0.3 + 1e-9 || maxY - minY > 0.3 + 1e-9) invalid();
  return { minX, maxX, minY, maxY };
}

function isKoreaPosition(position: GeoPosition | null | undefined): boolean {
  return position != null && Number.isFinite(position.lat) && Number.isFinite(position.lng)
    && position.lat >= 33 && position.lat <= 39.5 && position.lng >= 124 && position.lng <= 132;
}

export function buildNearbyBounds(position: GeoPosition): NearbyBounds {
  if (!isKoreaPosition(position)) throw new Error("Invalid nearby position");
  const x = Math.floor(position.lng * 20);
  const y = Math.floor(position.lat * 20);
  return {
    minX: Math.max(124, (x - 1) / 20), maxX: Math.min(132, (x + 2) / 20),
    minY: Math.max(33, (y - 1) / 20), maxY: Math.min(39.5, (y + 2) / 20),
  };
}
