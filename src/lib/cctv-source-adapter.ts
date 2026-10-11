import { buildCctvSnapshot, type CctvSnapshot } from "./cctv-api";
import { cctvFeeds, detectionEvents, type CctvFeed, type DetectionEvent } from "./cctv";
import {
  buildItsCctvInfoUrl,
  mapItsCctvRecordToFeed,
  parseItsCctvResponse,
  type ItsCctvInfoParams,
} from "./its";

export type CctvSourceMode = "mock" | "its";

export type CctvSourceAdapter = {
  id: CctvSourceMode;
  getSnapshot: () => Promise<CctvSnapshot>;
};

type Clock = () => Date;

type ItsFetcher = (url: URL) => Promise<unknown>;

const defaultItsParams: Omit<ItsCctvInfoParams, "apiKey"> = {
  roadType: "ex",
  cctvType: "4",
  minX: 126.7,
  maxX: 127.4,
  minY: 37.1,
  maxY: 37.7,
  responseType: "json",
};

const maxItsCoordinateSpan = 1;
const maxItsCoordinateArea = 0.75;

export function createMockCctvSourceAdapter({
  feeds = cctvFeeds,
  events = detectionEvents,
  now = () => new Date(),
}: {
  feeds?: CctvFeed[];
  events?: DetectionEvent[];
  now?: Clock;
} = {}): CctvSourceAdapter {
  return {
    id: "mock",
    async getSnapshot() {
      return buildCctvSnapshot(feeds, events, now(), "mock");
    },
  };
}

export function createItsCctvSourceAdapter({
  apiKey,
  params = defaultItsParams,
  fetcher = fetchItsJson,
  now = () => new Date(),
  cacheTtlMs = 60_000,
}: {
  apiKey: string;
  params?: Omit<ItsCctvInfoParams, "apiKey">;
  fetcher?: ItsFetcher;
  now?: Clock;
  cacheTtlMs?: number;
}): CctvSourceAdapter {
  let cachedSnapshot: CctvSnapshot | undefined;
  let cachedAtMs = 0;

  return {
    id: "its",
    async getSnapshot() {
      const requestedAt = now();

      if (cachedSnapshot && requestedAt.getTime() - cachedAtMs < cacheTtlMs) {
        return cloneSnapshot(cachedSnapshot);
      }

      validateItsRequestPolicy(params);
      const url = buildItsCctvInfoUrl({
        apiKey,
        ...params,
      });
      const payload = await fetcher(url);
      const feeds = parseItsCctvResponse(
        payload as Parameters<typeof parseItsCctvResponse>[0],
      ).map(mapItsCctvRecordToFeed);

      cachedSnapshot = buildCctvSnapshot(feeds, [], requestedAt, "its");
      cachedAtMs = requestedAt.getTime();

      return cloneSnapshot(cachedSnapshot);
    },
  };
}

function cloneSnapshot(snapshot: CctvSnapshot): CctvSnapshot {
  return buildCctvSnapshot(
    snapshot.feeds,
    snapshot.events,
    new Date(snapshot.meta.generatedAt),
    snapshot.meta.source,
  );
}

export function getConfiguredCctvSourceAdapter(env: {
  CCTV_SOURCE_MODE?: string;
  ITS_API_KEY?: string;
}): CctvSourceAdapter {
  const mode = parseSourceMode(env.CCTV_SOURCE_MODE);

  if (mode === "its" && env.ITS_API_KEY) {
    return createItsCctvSourceAdapter({ apiKey: env.ITS_API_KEY });
  }

  return createMockCctvSourceAdapter();
}

function validateItsRequestPolicy(params: Omit<ItsCctvInfoParams, "apiKey">) {
  const lngSpan = Math.abs(params.maxX - params.minX);
  const latSpan = Math.abs(params.maxY - params.minY);
  const area = lngSpan * latSpan;

  if (lngSpan > maxItsCoordinateSpan || latSpan > maxItsCoordinateSpan || area > maxItsCoordinateArea) {
    throw new Error(
      `ITS request blocked: coordinate box too large (${lngSpan.toFixed(2)} x ${latSpan.toFixed(2)})`,
    );
  }
}

function parseSourceMode(value: string | undefined): CctvSourceMode {
  return value === "its" ? "its" : "mock";
}

async function fetchItsJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`ITS API ${response.status}`);
  }

  return response.json();
}
