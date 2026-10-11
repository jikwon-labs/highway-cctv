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
}: {
  apiKey: string;
  params?: Omit<ItsCctvInfoParams, "apiKey">;
  fetcher?: ItsFetcher;
  now?: Clock;
}): CctvSourceAdapter {
  return {
    id: "its",
    async getSnapshot() {
      const url = buildItsCctvInfoUrl({
        apiKey,
        ...params,
      });
      const payload = await fetcher(url);
      const feeds = parseItsCctvResponse(
        payload as Parameters<typeof parseItsCctvResponse>[0],
      ).map(mapItsCctvRecordToFeed);

      return buildCctvSnapshot(feeds, [], now(), "its");
    },
  };
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
