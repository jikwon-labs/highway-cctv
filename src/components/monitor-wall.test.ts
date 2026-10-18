import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cctvFeeds } from "@/lib/cctv";
import { createSavedTV, serializeSavedTVs, MONITOR_STORAGE_UNAVAILABLE } from "@/lib/monitor-wall";
import { MonitorAddButton, MonitorWall, loadMonitorFeed } from "./monitor-wall";
import MonitorPage from "@/app/monitor/page";

const snapshotOverride = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useSyncExternalStore: (...args: Parameters<typeof actual.useSyncExternalStore>) => snapshotOverride.value ?? actual.useSyncExternalStore(...args) };
});

afterEach(() => { snapshotOverride.value = undefined; vi.unstubAllGlobals(); });

describe("monitor wall SSR", () => {
  it("restores only chosen cards with reorder/remove/refresh controls and no automatic metadata requests", () => {
    snapshotOverride.value = serializeSavedTVs(cctvFeeds.slice(0, 2).map(createSavedTV));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(createElement(MonitorWall));
    expect(html).toContain(cctvFeeds[0].name);
    expect(html).toContain(cctvFeeds[1].name);
    expect(html).not.toContain(cctvFeeds[2].name);
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("위로");
    expect(html).toContain("아래로");
    expect(html).toContain("선택 제거");
    expect(html).toContain("정보 갱신");
    expect(html).not.toContain("<video");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows saved and full add-button states plus blocked storage feedback", () => {
    snapshotOverride.value = serializeSavedTVs(cctvFeeds.slice(0, 4).map(createSavedTV));
    const saved = renderToStaticMarkup(createElement(MonitorAddButton, { feed: cctvFeeds[0] }));
    expect(saved).toContain("추가됨");
    expect(saved).toContain('disabled=""');
    const full = renderToStaticMarkup(createElement(MonitorAddButton, { feed: cctvFeeds[4] }));
    expect(full).toContain("최대 4대");
    expect(full).toContain('disabled=""');
    snapshotOverride.value = MONITOR_STORAGE_UNAVAILABLE;
    const blocked = renderToStaticMarkup(createElement(MonitorWall));
    expect(blocked).toContain("브라우저 저장소");
    expect(blocked).toContain('role="alert"');
  });
  it("renders without server storage, location, metadata or video requests", () => {
    const fetch = vi.fn(() => { throw new Error("No automatic requests"); });
    vi.stubGlobal("fetch", fetch);
    const storageRead = vi.fn(() => { throw new Error("No server localStorage"); });
    vi.stubGlobal("window", { get localStorage() { return storageRead(); } });
    const html = renderToStaticMarkup(createElement(MonitorWall));
    expect(html).toContain("모니터 벽");
    expect(html).toContain("최대 4대");
    expect(html).toContain("정보 갱신");
    expect(html).toContain("관제 화면에서 CCTV를 추가");
    expect(html).not.toMatch(/<video|<iframe|autoplay/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalled();
  });
  it("exports the add button and a standalone route with navigation", () => {
    const html = renderToStaticMarkup(createElement(MonitorAddButton, { feed: cctvFeeds[0] }));
    expect(html).toContain("모니터에 추가");
    const page = renderToStaticMarkup(createElement(MonitorPage));
    for (const href of ['href="/"', 'href="/events"', 'href="/monitor"']) expect(page).toContain(href);
    expect(page).not.toContain("<video");
  });
});

describe("explicit saved-CCTV metadata lookup", () => {
  it("uses only coarse saved CCTV bounds and matches physical identity despite changed IDs", async () => {
    const tv = createSavedTV(cctvFeeds[0]);
    const changed = { ...cctvFeeds[0], id: "its-unknown-999" };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ feeds: [cctvFeeds[1], changed] }) });
    const signal = new AbortController().signal;
    expect(await loadMonitorFeed(tv, signal, fetcher)).toEqual(changed);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toMatch(/^\/api\/cctv\?minX=/);
    const params = new URL(url, "http://fixture.invalid").searchParams;
    expect([...params.keys()]).toEqual(["minX", "maxX", "minY", "maxY"]);
    expect(url).not.toContain(String(tv.coordinates.lat));
    expect(options).toEqual({ signal });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
