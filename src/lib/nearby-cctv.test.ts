import { describe, expect, it } from "vitest";
import { cctvFeeds, type CctvFeed } from "./cctv";
import { buildNearbyBounds, buildNearbyQuery, parseCctvBounds, distanceKm, sortFeedsByDistance } from "./nearby-cctv";

describe("nearby CCTV", () => {
  it("drops absent or malformed feed coordinates rather than breaking the valid results", () => {
    const malformed = [undefined, null, { lat: "37", lng: 127 }, { lat: 37 }, { lat: 91, lng: 181 }]
      .map((coordinates) => ({ ...cctvFeeds[0], coordinates }) as unknown as CctvFeed);
    expect(sortFeedsByDistance([...malformed, cctvFeeds[0]], { lat: 37, lng: 127 })).toEqual([cctvFeeds[0]]);
  });
  it("rejects malformed, ambiguous, oversized, off-grid or out-of-country bbox queries generically", () => {
    const valid = "minX=127&maxX=127.15&minY=37&maxY=37.15";
    for (const query of ["minX=127", "lat=37.3349123&lng=127.1049876", `${valid}&accuracy=12`,
      `${valid}&minX=127`, valid.replace("minX=127", "minX="), valid.replace("minX=127", "minX=NaN"),
      valid.replace("minX=127", "minX=Infinity"), valid.replace("minX=127", "minX=0x7f"),
      valid.replace("minX=127", "minX=128"), valid.replace("maxX=127.15", "maxX=127"),
      valid.replace("maxX=127.15", "maxX=127.35"), valid.replace("maxY=37.15", "maxY=37.35"),
      valid.replace("minX=127", "minX=123.95"), valid.replace("maxX=127.15", "maxX=132.05"),
      valid.replace("minY=37", "minY=32.95"), valid.replace("maxY=37.15", "maxY=39.55"),
      valid.replace("minX=127", "minX=127.001")]) {
      expect(() => parseCctvBounds(new URLSearchParams(query)), query).toThrow("Invalid CCTV bounds");
    }
    expect(parseCctvBounds(new URLSearchParams("minX=127&maxX=127.3&minY=37&maxY=37.3"))).toEqual({ minX: 127, maxX: 127.3, minY: 37, maxY: 37.3 });
    expect(() => buildNearbyQuery({ minX: 127.001, maxX: 127.15, minY: 37, maxY: 37.15 })).toThrow("Invalid CCTV bounds");
  });
  it("round-trips only coarse bbox fields through the API query without raw GPS or accuracy", () => {
    const position = { lat: 37.3349123, lng: 127.1049876, accuracyMeters: 12.345 };
    const bounds = buildNearbyBounds(position);
    const query = buildNearbyQuery(bounds);
    expect(query).toBe("/api/cctv?minX=127.05&maxX=127.2&minY=37.25&maxY=37.4");
    expect(query).not.toContain(String(position.lat));
    expect(query).not.toContain(String(position.lng));
    expect(query).not.toContain("accuracy");
    expect(parseCctvBounds(new URL(query, "https://example.test").searchParams)).toEqual(bounds);
    expect(parseCctvBounds(new URLSearchParams())).toBeUndefined();
  });
  it("sorts valid feeds nearest first, preserves ties and never mutates the input", () => {
    const make = (id: string, lat: number, lng: number) => Object.freeze({ ...cctvFeeds[0], id, coordinates: Object.freeze({ lat, lng }) });
    const feeds = Object.freeze([make("far", 38, 127), make("tie-1", 37, 127), make("bad", NaN, 127),
      make("tie-2", 37, 127), make("outside", 0, 0), make("near", 37.01, 127)]);
    const result = sortFeedsByDistance(feeds, { lat: 37, lng: 127 });
    expect(result.map((feed) => feed.id)).toEqual(["tie-1", "tie-2", "near", "far"]);
    expect(feeds.map((feed) => feed.id)).toEqual(["far", "tie-1", "bad", "tie-2", "outside", "near"]);
    expect(() => sortFeedsByDistance(feeds, { lat: Infinity, lng: 127 })).toThrow("Invalid nearby position");
  });
  it("measures Haversine distance in km including identical and antipodal points", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.195, 3);
    expect(distanceKm({ lat: 37.5665, lng: 126.978 }, { lat: 35.1796, lng: 129.0756 })).toBeCloseTo(325.111, 2);
    expect(distanceKm({ lat: 37, lng: 127 }, { lat: 37, lng: 127 })).toBe(0);
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015.114, 2);
  });
  it("rejects non-finite and out-of-Korea positions without echoing them", () => {
    for (const position of [{ lat: NaN, lng: 127 }, { lat: 37, lng: Infinity },
      { lat: 32.99, lng: 127 }, { lat: 39.51, lng: 127 },
      { lat: 37, lng: 123.99 }, { lat: 37, lng: 132.01 }]) {
      expect(() => buildNearbyBounds(position)).toThrow("Invalid nearby position");
    }
  });

  it("clips cell margins at the supported country boundary and keeps exact grid edges", () => {
    expect(buildNearbyBounds({ lat: 33, lng: 124 })).toEqual({ minX: 124, maxX: 124.1, minY: 33, maxY: 33.1 });
    expect(buildNearbyBounds({ lat: 39.5, lng: 132 })).toEqual({ minX: 131.95, maxX: 132, minY: 39.45, maxY: 39.5 });
    expect(buildNearbyBounds({ lat: 37.35, lng: 127.15 })).toEqual({ minX: 127.1, maxX: 127.25, minY: 37.3, maxY: 37.45 });
  });
  it("coarsens precise positions to the same 0.05-degree cell plus one-cell margin", () => {
    expect(buildNearbyBounds({ lat: 37.3349123, lng: 127.1049876 })).toEqual({
      minX: 127.05, maxX: 127.2, minY: 37.25, maxY: 37.4,
    });
    expect(buildNearbyBounds({ lat: 37.349999, lng: 127.149999 })).toEqual(
      buildNearbyBounds({ lat: 37.3349123, lng: 127.1049876 }),
    );
  });
});
