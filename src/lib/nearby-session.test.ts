import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { cctvFeeds } from "./cctv";
import { buildCctvSnapshot } from "./cctv-api";
import { createNearbySession } from "./nearby-session";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const precise = { lat: 37.3349123, lng: 127.1049876, accuracyMeters: 12.345 };
const sourceSnapshot = () => buildCctvSnapshot([
  { ...cctvFeeds[0], id: "far", coordinates: { lat: 38, lng: 128 } },
  { ...cctvFeeds[0], id: "near", coordinates: { lat: 37.335, lng: 127.105 } },
], [], new Date("2026-01-01T00:00:00Z"));

function harness() {
  const fetch = vi.fn();
  const requestPosition = vi.fn();
  const onSnapshot = vi.fn();
  const onClear = vi.fn();
  const session = createNearbySession({ initialApiStatus: "초기", onSnapshot, onClear }, { fetch, requestPosition });
  return { session, fetch, requestPosition, onSnapshot, onClear };
}

describe("nearby session", () => {
  it("header refresh replaces a pending permission request without letting it reactivate location", async () => {
    const h = harness();
    h.fetch.mockResolvedValue({ ok: true, json: async () => sourceSnapshot() });
    h.session.onLocate();
    const [success, error, signal] = h.requestPosition.mock.calls[0];
    h.session.onRefresh();
    expect(signal.aborted).toBe(true);
    success(precise);
    error(1);
    await tick();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.fetch.mock.calls[0][0]).toBe("/api/cctv");
    expect(h.session.getSnapshot().position).toBeUndefined();
    expect(h.onSnapshot.mock.calls[0][1]).toBe(false);
  });
  it("disposal aborts an in-flight network request and ignores its eventual rejection", async () => {
    const h = harness();
    let reject!: (reason: Error) => void;
    h.fetch.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    h.session.onRefresh();
    const signal = h.fetch.mock.calls[0][1].signal;
    h.session.dispose();
    expect(signal.aborted).toBe(true);
    const disposedState = h.session.getSnapshot();
    reject(new Error("private late source failure"));
    await tick();
    expect(h.session.getSnapshot()).toBe(disposedState);
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(h.onClear).not.toHaveBeenCalled();
  });
  it("handles synchronous browser GPS failures without throwing or leaving the header busy", () => {
    const h = harness();
    h.requestPosition.mockImplementation(() => { throw new Error("private browser failure"); });
    expect(() => h.session.onLocate()).not.toThrow();
    expect(h.session.getSnapshot()).toMatchObject({ status: "error", isRefreshing: false, message: "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("uses updated callbacks when an in-flight response finishes", async () => {
    const h = harness();
    let resolve!: (value: unknown) => void;
    h.fetch.mockImplementation(() => new Promise(r => { resolve = r; }));
    h.session.onRefresh();
    const onSnapshot = vi.fn();
    const onClear = vi.fn();
    h.session.updateCallbacks({ onSnapshot, onClear });
    resolve({ ok: true, json: async () => sourceSnapshot() });
    await tick();
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(onSnapshot).toHaveBeenCalledOnce();
    h.session.onClear();
    expect(h.onClear).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledOnce();
  });
  it("renders the hook server-side without browser globals or any initial request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", undefined);
    const onSnapshot = vi.fn();
    const onClear = vi.fn();
    try {
      const { useNearbyCctv } = await import("../components/use-nearby-cctv");
      function Probe() {
        const nearby = useNearbyCctv({ initialApiStatus: "초기", onSnapshot, onClear });
        expect(nearby.onLocate).toBeTypeOf("function");
        expect(nearby.onRefresh).toBeTypeOf("function");
        expect(nearby.onClear).toBeTypeOf("function");
        return createElement("p", null, `${nearby.status}:${nearby.apiStatus}:${nearby.isRefreshing}`);
      }
      expect(renderToStaticMarkup(createElement(Probe))).toBe("<p>idle:초기:false</p>");
      expect(fetch).not.toHaveBeenCalled();
      expect(onSnapshot).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("resolves browser dependencies lazily and uses one-shot GPS only after a click", async () => {
    const gps = vi.fn();
    const navigatorRead = vi.fn(() => ({ geolocation: { getCurrentPosition: gps } }));
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => sourceSnapshot() });
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { configurable: true, get: navigatorRead });
    vi.stubGlobal("fetch", fetch);
    try {
      const onSnapshot = vi.fn();
      const session = createNearbySession({ initialApiStatus: "초기", onSnapshot, onClear: vi.fn() });
      expect(navigatorRead).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      session.onLocate();
      expect(gps).toHaveBeenCalledOnce();
      expect(gps.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
      gps.mock.calls[0][0]({ coords: { latitude: precise.lat, longitude: precise.lng, accuracy: precise.accuracyMeters } });
      await tick();
      expect(session.getSnapshot().position).toEqual(precise);
      expect(onSnapshot).toHaveBeenCalledOnce();
      session.dispose();
    } finally {
      if (original) Object.defineProperty(globalThis, "navigator", original);
      else Reflect.deleteProperty(globalThis, "navigator");
      vi.unstubAllGlobals();
    }
  });
  it.each([
    [1, "위치 권한이 거부되었습니다. 브라우저 설정에서 허용한 뒤 다시 시도해 주세요."],
    [2, "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."],
    [3, "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요."],
    [0, "이 브라우저에서는 위치 확인을 사용할 수 없습니다."],
  ])("classifies GPS error %s without querying or exposing native messages", (code, message) => {
    const h = harness();
    h.session.onLocate();
    h.requestPosition.mock.calls[0][1](code);
    expect(h.session.getSnapshot()).toMatchObject({ status: "error", isRefreshing: false, message });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it.each([{ lat: 0, lng: 0 }, { lat: NaN, lng: 127 }, { lat: 37, lng: Infinity }])("rejects unsupported GPS before making a query", position => {
    const h = harness();
    h.session.onLocate();
    expect(() => h.requestPosition.mock.calls[0][0](position)).not.toThrow();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.session.getSnapshot()).toMatchObject({ status: "error", isRefreshing: false, message: "국내 지원 범위의 위치에서만 주변 CCTV를 조회할 수 있습니다." });
    expect(h.session.getSnapshot().position).toBeUndefined();
  });
  it.each([
    { ok: false, json: async () => ({ error: "private source error" }) },
    { ok: true, json: async () => null },
    { ok: true, json: async () => ({ feeds: [], events: [] }) },
    { ok: true, json: async () => ({ meta: {}, feeds: [], events: [] }) },
    { ok: true, json: async () => ({ ...sourceSnapshot(), events: {} }) },
    { ok: true, json: async () => { throw new Error("private parse error"); } },
  ])("rejects failed or malformed source responses with a static error and no synthetic snapshot", async response => {
    const h = harness();
    h.fetch.mockResolvedValue(response);
    h.session.onRefresh();
    await tick();
    expect(h.session.getSnapshot()).toMatchObject({ status: "error", isRefreshing: false, message: "CCTV 데이터를 불러오지 못했습니다. 다시 시도해 주세요.", apiStatus: "데이터 갱신 실패" });
    expect(h.onSnapshot).not.toHaveBeenCalled();
  });
  it("handles a rejected network request without exposing its exception", async () => {
    const h = harness();
    h.fetch.mockRejectedValue(new Error("private request detail"));
    h.session.onRefresh();
    await tick();
    expect(h.session.getSnapshot()).toMatchObject({ status: "error", isRefreshing: false });
    expect(JSON.stringify(h.session.getSnapshot())).not.toContain("private");
  });
  it("aborts GPS on replacement and disposes without parent clear or late reactivation", async () => {
    const h = harness();
    h.fetch.mockResolvedValue({ ok: true, json: async () => sourceSnapshot() });
    h.session.onLocate();
    const [oldSuccess, oldError, oldSignal] = h.requestPosition.mock.calls[0];
    h.session.onLocate();
    expect(oldSignal.aborted).toBe(true);
    oldSuccess(precise);
    oldError(1);
    expect(h.fetch).not.toHaveBeenCalled();
    const [success, error, signal] = h.requestPosition.mock.calls[1];
    h.session.dispose();
    expect(signal.aborted).toBe(true);
    success(precise);
    error(2);
    h.session.onLocate();
    h.session.onRefresh();
    h.session.onClear();
    await tick();
    expect(h.requestPosition).toHaveBeenCalledTimes(2);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.onClear).not.toHaveBeenCalled();
    expect(h.session.getSnapshot()).toMatchObject({ status: "idle", isRefreshing: false });
  });
  it("silent cancel supports remount, clears memory, and ignores an already parsing response", async () => {
    const h = harness();
    let resolveJson!: (value: unknown) => void;
    h.fetch.mockResolvedValue({ ok: true, json: () => new Promise(resolve => { resolveJson = resolve; }) });
    h.session.onLocate();
    h.requestPosition.mock.calls[0][0](precise);
    await tick();
    const signal = h.fetch.mock.calls[0][1].signal;
    h.session.cancel();
    expect(signal.aborted).toBe(true);
    expect(h.session.getSnapshot().position).toBeUndefined();
    resolveJson(sourceSnapshot());
    await tick();
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(h.onClear).not.toHaveBeenCalled();
    h.session.onLocate();
    expect(h.requestPosition).toHaveBeenCalledTimes(2);
    h.session.dispose();
  });
  it("header refresh retains the region and distance order without auto-selection or asking GPS again", async () => {
    const h = harness();
    h.fetch.mockResolvedValue({ ok: true, json: async () => sourceSnapshot() });
    h.session.onLocate();
    h.requestPosition.mock.calls[0][0](precise);
    await tick();
    const previousSignal = h.fetch.mock.calls[0][1].signal;
    h.session.onRefresh();
    expect(previousSignal.aborted).toBe(true);
    expect(h.session.getSnapshot()).toMatchObject({ status: "loading", isRefreshing: true, position: precise });
    expect(h.fetch.mock.calls[1][0]).toBe(h.fetch.mock.calls[0][0]);
    await tick();
    expect(h.requestPosition).toHaveBeenCalledOnce();
    expect(h.onSnapshot.mock.calls[1][1]).toBe(false);
    expect(h.onSnapshot.mock.calls[1][0].feeds.map((feed: { id: string }) => feed.id)).toEqual(["near", "far"]);
  });
  it("ordinary refresh uses the default box and ignores an aborted late response", async () => {
    const h = harness();
    let resolveOld!: (response: unknown) => void;
    h.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => sourceSnapshot() });
    h.session.onRefresh();
    const [url, { signal }] = h.fetch.mock.calls[0];
    expect(url).toBe("/api/cctv");
    h.session.onRefresh();
    expect(signal.aborted).toBe(true);
    await tick();
    const latest = h.session.getSnapshot();
    resolveOld({ ok: true, json: async () => ({ ...sourceSnapshot(), feeds: [] }) });
    await tick();
    expect(h.onSnapshot).toHaveBeenCalledOnce();
    expect(h.onSnapshot.mock.calls[0][1]).toBe(false);
    expect(h.session.getSnapshot()).toBe(latest);
    expect(h.requestPosition).not.toHaveBeenCalled();
  });
  it("locates only on consent, sends only coarse bounds, and selects nearest returned CCTV", async () => {
    const h = harness();
    const snapshot = sourceSnapshot();
    h.fetch.mockResolvedValue({ ok: true, json: async () => snapshot });
    h.session.onLocate();
    const [success, , signal] = h.requestPosition.mock.calls[0];
    success(precise);
    expect(h.session.getSnapshot()).toMatchObject({ status: "loading", isRefreshing: true, position: precise });
    expect(h.fetch).toHaveBeenCalledWith("/api/cctv?minX=127.05&maxX=127.2&minY=37.25&maxY=37.4", {
      method: "GET", credentials: "same-origin", cache: "no-store", signal,
    });
    const request = JSON.stringify(h.fetch.mock.calls[0]);
    expect(request).not.toContain(String(precise.lat));
    expect(request).not.toContain(String(precise.lng));
    expect(request).not.toContain("accuracy");
    await tick();
    expect(h.onSnapshot).toHaveBeenCalledOnce();
    expect(h.onSnapshot.mock.calls[0][0].feeds.map((feed: { id: string }) => feed.id)).toEqual(["near", "far"]);
    expect(h.onSnapshot.mock.calls[0][1]).toBe(true);
    expect(snapshot.feeds.map(feed => feed.id)).toEqual(["far", "near"]);
    expect(h.session.getSnapshot()).toMatchObject({ status: "ready", isRefreshing: false });
    expect(h.session.getSnapshot().message).toContain("조회 범위");
    expect(h.session.getSnapshot().message).toContain("직선거리");
  });
  it("cancels pending permission, aborts its signal, and ignores late GPS callbacks", () => {
    const h = harness();
    h.session.onLocate();
    expect(h.session.getSnapshot()).toMatchObject({ status: "locating", isRefreshing: true });
    expect(h.requestPosition).toHaveBeenCalledOnce();
    const [success, error, signal] = h.requestPosition.mock.calls[0];
    h.session.onClear();
    expect(signal.aborted).toBe(true);
    success({ lat: 37.3349123, lng: 127.1049876 });
    error(1);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(h.session.getSnapshot()).toMatchObject({ status: "idle", isRefreshing: false });
    expect(h.onClear).toHaveBeenCalledOnce();
  });
  it("does no work initially and exposes a stable, subscribable SSR snapshot", () => {
    const h = harness();
    const initial = h.session.getSnapshot();
    expect(initial).toEqual({ status: "idle", message: "", isRefreshing: false, apiStatus: "초기" });
    expect(h.session.getSnapshot()).toBe(initial);
    expect(h.session.getServerSnapshot()).toBe(initial);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.requestPosition).not.toHaveBeenCalled();
    const listener = vi.fn();
    const unsubscribe = h.session.subscribe(listener);
    h.session.onClear();
    expect(listener).toHaveBeenCalledOnce();
    expect(h.onClear).toHaveBeenCalledOnce();
    unsubscribe();
    h.session.onClear();
    expect(listener).toHaveBeenCalledOnce();
  });
});
