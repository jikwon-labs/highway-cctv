import type { CctvSnapshot } from "./cctv-api";
import { buildNearbyBounds, buildNearbyQuery, sortFeedsByDistance, type GeoPosition } from "./nearby-cctv";

export type NearbyStatus = "idle" | "locating" | "loading" | "ready" | "error";
export type UserPosition = GeoPosition & { accuracyMeters?: number };
export type NearbyState = {
  position?: UserPosition;
  status: NearbyStatus;
  message: string;
  isRefreshing: boolean;
  apiStatus: string;
};
export type NearbySessionOptions = {
  initialApiStatus: string;
  onSnapshot: (snapshot: CctvSnapshot, selectNearest: boolean) => void;
  onClear: () => void;
};
export type NearbySessionDependencies = {
  fetch: (url: string, options: RequestInit) => Promise<Pick<Response, "ok" | "json">>;
  requestPosition: (success: (position: UserPosition) => void, error: (code: number) => void, signal: AbortSignal) => void;
};

// Browser globals are deliberately read inside explicit actions, never on import/mount.
const browserDependencies: NearbySessionDependencies = {
  fetch: (url, options) => globalThis.fetch(url, options),
  requestPosition(success, error, signal) {
    if (signal.aborted) return;
    const geolocation = typeof navigator === "undefined" ? undefined : navigator.geolocation;
    if (!geolocation) { error(0); return; }
    geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!signal.aborted) success({ lat: coords.latitude, lng: coords.longitude, accuracyMeters: coords.accuracy });
      },
      ({ code }) => { if (!signal.aborted) error(code); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  },
};

function isSnapshot(value: unknown): value is CctvSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CctvSnapshot>;
  const meta = candidate.meta;
  return Array.isArray(candidate.feeds) && Array.isArray(candidate.events)
    && !!meta && typeof meta === "object"
    && (meta.source === "mock" || meta.source === "its")
    && typeof meta.generatedAt === "string"
    && Number.isInteger(meta.feedCount) && meta.feedCount >= 0
    && Number.isInteger(meta.eventCount) && meta.eventCount >= 0;
}

export function createNearbySession(options: NearbySessionOptions, dependencies: NearbySessionDependencies = browserDependencies) {
  let operation: AbortController | undefined;
  let disposed = false;
  const initial: NearbyState = { status: "idle", message: "", isRefreshing: false, apiStatus: options.initialApiStatus };
  let state = initial;
  const listeners = new Set<() => void>();
  function publish(next: NearbyState) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function cancel() {
    operation?.abort();
    operation = undefined;
    publish({ ...initial });
  }
  function fail(signal: AbortSignal, message: string, apiStatus = state.apiStatus) {
    if (signal.aborted) return;
    publish({ ...state, status: "error", isRefreshing: false, message, apiStatus });
  }
  async function load(signal: AbortSignal, selectNearest: boolean) {
    try {
      const position = state.position;
      const url = position ? buildNearbyQuery(buildNearbyBounds(position)) : "/api/cctv";
      publish({ ...state, status: "loading", isRefreshing: true, message: "CCTV를 조회하고 있습니다." });
      const response = await dependencies.fetch(url, {
        method: "GET", credentials: "same-origin", cache: "no-store", signal,
      });
      if (signal.aborted) return;
      if (!response.ok) throw new Error("Source unavailable");
      const snapshot: unknown = await response.json();
      if (signal.aborted) return;
      if (!isSnapshot(snapshot)) throw new Error("Invalid snapshot");
      const sorted = position ? { ...snapshot, feeds: sortFeedsByDistance(snapshot.feeds, position) } : snapshot;
      publish({
        ...state, status: "ready", isRefreshing: false,
        message: position
          ? `조회 범위 내 CCTV ${sorted.feeds.length}개 · 직선거리 순`
          : `CCTV ${sorted.feeds.length}개를 갱신했습니다.`,
        apiStatus: `CCTV ${sorted.feeds.length}개 · 후보 ${sorted.events.length}건`,
      });
      if (!signal.aborted) options.onSnapshot(sorted, selectNearest);
    } catch {
      fail(signal, "CCTV 데이터를 불러오지 못했습니다. 다시 시도해 주세요.", "데이터 갱신 실패");
    }
  }
  return {
    updateCallbacks(callbacks: Pick<NearbySessionOptions, "onSnapshot" | "onClear">) {
      options = { ...options, ...callbacks };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    onLocate() {
      if (disposed) return;
      operation?.abort();
      operation = new AbortController();
      const { signal } = operation;
      publish({ ...state, status: "locating", message: "위치 권한을 확인하고 있습니다.", isRefreshing: true });
      try {
        dependencies.requestPosition((position) => {
          if (signal.aborted) return;
          try {
            buildNearbyBounds(position);
          } catch {
            fail(signal, "국내 지원 범위의 위치에서만 주변 CCTV를 조회할 수 있습니다.");
            return;
          }
          state = { ...state, position: { ...position } };
          void load(signal, true);
        }, (code) => {
          fail(signal, code === 1
            ? "위치 권한이 거부되었습니다. 브라우저 설정에서 허용한 뒤 다시 시도해 주세요."
            : code === 2 ? "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
            : code === 3 ? "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요."
            : "이 브라우저에서는 위치 확인을 사용할 수 없습니다.");
        }, signal);
      } catch {
        fail(signal, "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }
    },
    onRefresh() {
      if (disposed) return;
      operation?.abort();
      operation = new AbortController();
      void load(operation.signal, false);
    },
    onClear() {
      if (disposed) return;
      cancel();
      options.onClear();
    },
    cancel,
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      listeners.clear();
    },
  };
}
