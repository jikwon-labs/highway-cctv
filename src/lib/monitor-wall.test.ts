import { describe, expect, it, vi } from "vitest";
import { cctvFeeds } from "./cctv";
import { createMonitorMetadataSession, createMonitorStore, MONITOR_STORAGE_UNAVAILABLE, addSavedTV, removeSavedTV, reorderSavedTV, lookupSavedTV, MAX_MONITOR_TVS, createSavedTV, parseSavedTVs, serializeSavedTVs, savedTVStorageKey } from "./monitor-wall";

it("fetches only on refresh and ignores late responses after stop or a newer refresh", async () => {
  const resolvers: ((feed: typeof cctvFeeds[number]) => void)[] = [];
  const load = vi.fn((tv, signal: AbortSignal) => {
    expect(tv).toEqual(createSavedTV(cctvFeeds[0]));
    expect(signal).toBeInstanceOf(AbortSignal);
    return new Promise<typeof cctvFeeds[number]>((resolve) => { resolvers.push(resolve); });
  });
  const publish = vi.fn();
  const session = createMonitorMetadataSession(createSavedTV(cctvFeeds[0]), load, publish);
  expect(load).not.toHaveBeenCalled();
  const first = session.refresh();
  const second = session.refresh();
  expect(load.mock.calls[0][1].aborted).toBe(true);
  resolvers[1](cctvFeeds[0]);
  await second;
  expect(publish).toHaveBeenLastCalledWith({ status: "ready", feed: cctvFeeds[0] });
  const calls = publish.mock.calls.length;
  resolvers[0](cctvFeeds[1]);
  await first;
  expect(publish).toHaveBeenCalledTimes(calls);
  const deleted = session.refresh();
  session.stop();
  const afterStop = publish.mock.calls.length;
  resolvers[2](cctvFeeds[0]);
  await deleted;
  expect(load.mock.calls[2][1].aborted).toBe(true);
  expect(publish).toHaveBeenCalledTimes(afterStop);
});

function storageHost() {
  const events = new EventTarget();
  const data = new Map<string, string>();
  const localStorage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  const host = { localStorage, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) } as unknown as Window;
  return { host, data, localStorage };
}

describe("raw-string external monitor store", () => {
  it("is SSR-safe and has a stable empty server snapshot without touching storage", () => {
    const getHost = vi.fn(() => undefined);
    const store = createMonitorStore(getHost);
    expect(store.getServerSnapshot()).toBe("");
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
    expect(getHost).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe("");
    expect(store.update(() => [])).toEqual({ ok: false, changed: false });
  });
  it("reads stored selection and notifies same-tab and relevant cross-tab subscribers", () => {
    const { host, data } = storageHost();
    const raw = serializeSavedTVs([createSavedTV(cctvFeeds[0])]);
    data.set(savedTVStorageKey, raw);
    const first = createMonitorStore(() => host);
    const second = createMonitorStore(() => host);
    expect(first.getSnapshot()).toBe(raw);
    const notify = vi.fn();
    const unsubscribe = second.subscribe(notify);
    expect(first.update((tvs) => addSavedTV(tvs, cctvFeeds[1]))).toEqual({ ok: true, changed: true });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(parseSavedTVs(second.getSnapshot())).toHaveLength(2);
    const event = (key: string | null) => Object.assign(new Event("storage"), { key });
    host.dispatchEvent(event("unrelated"));
    expect(notify).toHaveBeenCalledTimes(1);
    host.dispatchEvent(event(savedTVStorageKey));
    host.dispatchEvent(event(null));
    expect(notify).toHaveBeenCalledTimes(3);
    unsubscribe();
    host.dispatchEvent(event(savedTVStorageKey));
    expect(notify).toHaveBeenCalledTimes(3);
  });
  it("contains read SecurityError and quota failures without claiming a save", () => {
    const { host, data, localStorage } = storageHost();
    const store = createMonitorStore(() => host);
    localStorage.getItem.mockImplementation(() => { throw new Error("SecurityError"); });
    expect(store.getSnapshot()).toBe(MONITOR_STORAGE_UNAVAILABLE);
    expect(store.update(() => [createSavedTV(cctvFeeds[0])])).toEqual({ ok: false, changed: false });
    localStorage.getItem.mockReturnValue("broken");
    localStorage.setItem.mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(store.update(() => [createSavedTV(cctvFeeds[0])])).toEqual({ ok: false, changed: false });
    expect(data.size).toBe(0);
  });
});

describe("bounded, stable TV selection", () => {
  it("adds at most four without relying on unstable upstream IDs", () => {
    const selection = cctvFeeds.slice(0, 4).reduce((tvs, feed) => addSavedTV(tvs, feed), [] as ReturnType<typeof createSavedTV>[]);
    expect(selection).toHaveLength(MAX_MONITOR_TVS);
    expect(addSavedTV(selection, cctvFeeds[4])).toEqual(selection);
    const changed = { ...cctvFeeds[0], id: "its-unknown-99", route: "updated route", coordinates: { lat: cctvFeeds[0].coordinates.lat + 0.000009, lng: cctvFeeds[0].coordinates.lng } };
    expect(addSavedTV(selection, changed)).toEqual(selection);
    expect(lookupSavedTV(selection[0], [cctvFeeds[1], changed])).toBe(changed);
    expect(lookupSavedTV(selection[0], [{ ...changed, name: "different" }])).toBeUndefined();
    expect(lookupSavedTV(selection[0], [{ ...changed, coordinates: { ...changed.coordinates, lat: 37 } }])).toBeUndefined();
  });
  it("removes and reorders without mutation or invalid boundary movement", () => {
    const selection = cctvFeeds.slice(0, 3).map(createSavedTV);
    const moved = reorderSavedTV(selection, selection[1].key, -1);
    expect(moved.map((tv) => tv.key)).toEqual([selection[1].key, selection[0].key, selection[2].key]);
    expect(reorderSavedTV(selection, selection[0].key, -1)).toEqual(selection);
    expect(reorderSavedTV(selection, selection[2].key, 1)).toEqual(selection);
    expect(reorderSavedTV(selection, "missing", 1)).toEqual(selection);
    expect(removeSavedTV(selection, selection[1].key)).toEqual([selection[0], selection[2]]);
    expect(selection).toHaveLength(3);
  });
});

describe("saved TV v1 schema", () => {
  it("treats malformed, unsupported, oversized and invalid identities as empty", () => {
    const tv = createSavedTV(cctvFeeds[0]);
    for (const raw of [null, "bad json", "null", "[]", JSON.stringify({ version: 2, tvs: [tv] }), JSON.stringify({ version: 1, tvs: Array(5).fill(tv) }), JSON.stringify({ version: 1, tvs: [{ ...tv, coordinates: { lat: 999, lng: 127 } }] }), JSON.stringify({ version: 1, tvs: [{ ...tv, key: "arbitrary" }] }), JSON.stringify({ version: 1, tvs: [{ ...tv, name: "" }] }), JSON.stringify({ version: 1, tvs: [tv, tv] })]) {
      expect(parseSavedTVs(raw)).toEqual([]);
    }
    expect(() => serializeSavedTVs(Array(5).fill(tv))).toThrow();
    const unsafe = { ...tv, streamUrl: "not-persisted", token: "not-persisted", coordinates: { ...tv.coordinates, accuracy: 2 } };
    expect(parseSavedTVs(JSON.stringify({ version: 1, tvs: [unsafe] }))).toEqual([tv]);
  });
  it("round-trips only a CCTV identity, never transient or sensitive feed fields", () => {
    const sensitiveFeed = { ...cctvFeeds[0], streamUrl: "https://example.invalid/transient?token=fixture" };
    const tv = createSavedTV(sensitiveFeed);
    const raw = serializeSavedTVs([tv]);
    expect(savedTVStorageKey).toBe("highway-cctv.monitor-wall.v1");
    expect(JSON.parse(raw)).toEqual({ version: 1, tvs: [{ key: tv.key, name: tv.name, route: tv.route, coordinates: tv.coordinates }] });
    expect(raw).not.toMatch(/streamUrl|token|apiKey|location|feed-gyeongbu/);
    expect(parseSavedTVs(raw)).toEqual([tv]);
  });
});
