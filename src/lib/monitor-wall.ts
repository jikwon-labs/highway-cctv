import type { CctvFeed } from "./cctv";

export const savedTVStorageKey = "highway-cctv.monitor-wall.v1";
export const SAVED_TV_VERSION = 1;
export const MAX_MONITOR_TVS = 4;
export type SavedTV = Pick<CctvFeed, "name" | "route" | "coordinates"> & { key: string };
export type SavedTVSchema = { version: 1; tvs: SavedTV[] };
export type MonitorMetadata =
  | { status: "idle" | "loading" | "missing" | "error"; feed?: never }
  | { status: "ready"; feed: CctvFeed };

/** A card owns one session. Stop on removal/unmount; late requests cannot recreate it. */
export function createMonitorMetadataSession(
  tv: SavedTV,
  load: (tv: SavedTV, signal: AbortSignal) => Promise<CctvFeed | undefined>,
  publish: (metadata: MonitorMetadata) => void,
) {
  let controller: AbortController | undefined;
  let generation = 0;
  const stop = () => { generation += 1; controller?.abort(); };
  return {
    stop,
    refresh: async () => {
      stop();
      const current = generation;
      const request = new AbortController();
      controller = request;
      publish({ status: "loading" });
      try {
        const feed = await load(tv, request.signal);
        if (current !== generation || request.signal.aborted) return;
        publish(feed ? { status: "ready", feed } : { status: "missing" });
      } catch {
        if (current === generation && !request.signal.aborted) publish({ status: "error" });
      }
    },
  };
}

export const MONITOR_STORAGE_UNAVAILABLE = "storage-unavailable";
const monitorChangeEvent = "highway-cctv:monitor-wall-changed";
type MonitorStoreResult = { ok: boolean; changed: boolean };

/** The snapshot is a primitive, not freshly parsed JSON; safe for useSyncExternalStore. */
export function createMonitorStore(getHost: () => Window | undefined = () => typeof window === "undefined" ? undefined : window) {
  const getSnapshot = (): string => {
    try { return getHost()?.localStorage.getItem(savedTVStorageKey) ?? ""; }
    catch { return MONITOR_STORAGE_UNAVAILABLE; }
  };
  return {
    getSnapshot,
    getServerSnapshot: () => "",
    subscribe: (notify: () => void) => {
      const host = getHost();
      if (!host) return () => {};
      const onStorage = (event: StorageEvent) => {
        if (event.key === savedTVStorageKey || event.key === null) notify();
      };
      host.addEventListener(monitorChangeEvent, notify);
      host.addEventListener("storage", onStorage);
      return () => {
        host.removeEventListener(monitorChangeEvent, notify);
        host.removeEventListener("storage", onStorage);
      };
    },
    update: (change: (current: SavedTV[]) => SavedTV[]): MonitorStoreResult => {
      try {
        const host = getHost();
        if (!host) return { ok: false, changed: false };
        // Read again at click time: another tab or button may have changed the wall.
        const raw = host.localStorage.getItem(savedTVStorageKey);
        const current = parseSavedTVs(raw);
        const next = serializeSavedTVs(change(current));
        const changed = next !== serializeSavedTVs(current);
        if (changed) {
          host.localStorage.setItem(savedTVStorageKey, next);
          host.dispatchEvent(new Event(monitorChangeEvent));
        }
        return { ok: true, changed };
      } catch { return { ok: false, changed: false }; }
    },
  };
}

/** ITS result indices change with each bounding box. Match the physical CCTV instead. */
export function lookupSavedTV<T extends Pick<CctvFeed, "name" | "coordinates">>(tv: SavedTV, feeds: readonly T[]): T | undefined {
  return feeds.find((feed) => feed.name === tv.name
    && Math.abs(feed.coordinates.lat - tv.coordinates.lat) <= 0.00001 + 1e-10
    && Math.abs(feed.coordinates.lng - tv.coordinates.lng) <= 0.00001 + 1e-10);
}

export function addSavedTV(tvs: readonly SavedTV[], feed: CctvFeed): SavedTV[] {
  if (tvs.length >= MAX_MONITOR_TVS || tvs.some((tv) => lookupSavedTV(tv, [feed]))) return [...tvs];
  const tv = createSavedTV(feed);
  return isSavedTV(tv) ? [...tvs, tv] : [...tvs];
}

export function removeSavedTV(tvs: readonly SavedTV[], key: string): SavedTV[] {
  return tvs.filter((tv) => tv.key !== key);
}

export function reorderSavedTV(tvs: readonly SavedTV[], key: string, direction: -1 | 1): SavedTV[] {
  const result = [...tvs];
  const index = result.findIndex((tv) => tv.key === key);
  const next = index + direction;
  if (index >= 0 && next >= 0 && next < result.length) [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export function createSavedTV(feed: Pick<CctvFeed, "name" | "route" | "coordinates">): SavedTV {
  return { key: `${encodeURIComponent(feed.name)}:${feed.coordinates.lat.toFixed(5)}:${feed.coordinates.lng.toFixed(5)}`, name: feed.name, route: feed.route, coordinates: { lat: feed.coordinates.lat, lng: feed.coordinates.lng } };
}

function isSavedTV(value: unknown): value is SavedTV {
  if (!value || typeof value !== "object") return false;
  const tv = value as SavedTV;
  return typeof tv.name === "string" && tv.name.trim().length > 0 && tv.name.length <= 300
    && typeof tv.route === "string" && tv.route.length <= 300
    && !!tv.coordinates && Number.isFinite(tv.coordinates.lat) && Number.isFinite(tv.coordinates.lng)
    && tv.coordinates.lat >= 33 && tv.coordinates.lat <= 39.5 && tv.coordinates.lng >= 124 && tv.coordinates.lng <= 132
    && tv.key === createSavedTV(tv).key;
}

function validTVs(value: unknown): value is SavedTV[] {
  return Array.isArray(value) && value.length <= MAX_MONITOR_TVS && value.every(isSavedTV)
    && new Set(value.map((tv) => tv.key)).size === value.length;
}

export function serializeSavedTVs(tvs: readonly SavedTV[]): string {
  if (!validTVs(tvs)) throw new Error("Invalid saved TV selection");
  return JSON.stringify({ version: SAVED_TV_VERSION, tvs: tvs.map(createSavedTV) } satisfies SavedTVSchema);
}

export function parseSavedTVs(raw: string | null): SavedTV[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return [];
    const schema = value as Partial<SavedTVSchema>;
    return schema.version === SAVED_TV_VERSION && validTVs(schema.tvs) ? schema.tvs.map(createSavedTV) : [];
  } catch { return []; }
}
