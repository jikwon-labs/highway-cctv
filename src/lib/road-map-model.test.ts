import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cctvFeeds, detectionEvents } from "./cctv";
import type { CctvRoadMapProps } from "../components/cctv-road-map";

vi.mock("leaflet", () => { throw new Error("Leaflet must not load during SSR"); });

describe("CctvRoadMap server boundary", () => {
  it("renders source/count/selection and a working fallback list without loading Leaflet", async () => {
    const { CctvRoadMap } = await import("../components/cctv-road-map");
    const html = renderToStaticMarkup(createElement(CctvRoadMap, {
      feeds: cctvFeeds, events: detectionEvents,
      selectedFeedId: cctvFeeds[0].id, onSelectFeed: () => {},
    }));
    expect(html).toContain("OpenStreetMap");
    expect(html).toContain("https://www.openstreetmap.org/copyright");
    expect(html).toContain(`지도에서 ${cctvFeeds[0].name} 선택`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("감지 후보 1건");
    expect(html).toContain("ITS 국가교통정보센터");
    expect(html).toContain("지도 불러오는 중");
  });
});

// Small DOM/Leaflet port doubles: no real tiles, network, or browser panning.
class TestElement {
  ownerDocument = { createElement: () => new TestElement() };
  textContent = "";
  className = "";
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: TestElement[] = [];
  listeners: Record<string, () => void> = {};
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  append(...children: TestElement[]) { this.children.push(...children); }
  addEventListener(name: string, callback: () => void) { this.listeners[name] = callback; }
}

function fixture() {
  const container = new TestElement();
  const map = {
    setView: vi.fn().mockReturnThis(), fitBounds: vi.fn().mockReturnThis(),
    panTo: vi.fn().mockReturnThis(), remove: vi.fn(),
    invalidateSize: vi.fn(), removeLayer: vi.fn(),
    attributionControl: { setPrefix: vi.fn() },
  };
  const tiles = { addTo: vi.fn().mockReturnThis(), on: vi.fn<(...args: unknown[]) => void>().mockReturnThis(), off: vi.fn() };
  const markers: Array<ReturnType<typeof makeMarker>> = [];
  function makeMarker() {
    return {
      addTo: vi.fn().mockReturnThis(), setIcon: vi.fn().mockReturnThis(),
      setLatLng: vi.fn().mockReturnThis(), setZIndexOffset: vi.fn().mockReturnThis(),
      bindTooltip: vi.fn().mockReturnThis(), unbindTooltip: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    };
  }
  const leaflet = {
    map: vi.fn(() => map), tileLayer: vi.fn(() => tiles),
    divIcon: vi.fn((options) => options),
    marker: vi.fn((...args: unknown[]) => { void args; const marker = makeMarker(); markers.push(marker); return marker; }),
    circle: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    circleMarker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
  };
  return { container, map, tiles, markers, leaflet, port: leaflet as unknown as typeof import("leaflet") };
}

describe("road map runtime", () => {
  it("places exact coordinates with safe selectable badges and viewport-only OSM tiles", async () => {
    const { createRoadMap, DEFAULT_ROAD_MAP_TILE_URL } = await import("./road-map-model");
    const f = fixture();
    const onSelectFeed = vi.fn();
    const feeds = [{ ...cctvFeeds[0], name: '<img src=x onerror="alert(1)">' }, cctvFeeds[1]];
    const events = [...detectionEvents, { ...detectionEvents[0], id: "dismissed", reviewStatus: "dismissed" as const }];
    createRoadMap(f.container as unknown as HTMLElement, f.port, () => ({
      feeds, events, selectedFeedId: feeds[0].id, onSelectFeed,
    }), vi.fn());
    expect(f.leaflet.map).toHaveBeenCalledWith(f.container, expect.objectContaining({ dragging: true, keyboard: true, zoomControl: true }));
    expect(DEFAULT_ROAD_MAP_TILE_URL).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(f.leaflet.tileLayer).toHaveBeenCalledWith(DEFAULT_ROAD_MAP_TILE_URL, expect.objectContaining({ keepBuffer: 0, updateWhenIdle: true }));
    expect(f.leaflet.marker).toHaveBeenNthCalledWith(1, [feeds[0].coordinates.lat, feeds[0].coordinates.lng], expect.anything());
    const button = f.leaflet.divIcon.mock.calls[0][0].html as TestElement;
    expect(button.attributes["aria-label"]).toBe(`지도에서 ${feeds[0].name} 선택`);
    expect(button.attributes["aria-pressed"]).toBe("true");
    expect(button.dataset).toMatchObject({ status: "online", severity: "critical" });
    expect(button.textContent).toBe("1");
    const tooltip = f.markers[0].bindTooltip.mock.calls[0][0] as TestElement;
    expect(tooltip.textContent).toContain(feeds[0].name);
    expect(tooltip.textContent).toContain("ITS 국가교통정보센터");
    button.listeners.click();
    expect(onSelectFeed).toHaveBeenCalledWith(feeds[0].id);
  });

  it("fits only changed coordinate sets and pans only changed external selection", async () => {
    const { createRoadMap } = await import("./road-map-model");
    const f = fixture();
    let snapshot = { feeds: cctvFeeds.slice(0, 2), events: detectionEvents, selectedFeedId: cctvFeeds[0].id, onSelectFeed: vi.fn() };
    const runtime = createRoadMap(f.container as unknown as HTMLElement, f.port, () => snapshot, vi.fn());
    expect(f.map.fitBounds).toHaveBeenCalledTimes(1);
    expect(f.map.fitBounds).toHaveBeenCalledWith(cctvFeeds.slice(0, 2).map((feed) => [feed.coordinates.lat, feed.coordinates.lng]), expect.objectContaining({ maxZoom: 14, animate: false }));
    snapshot = { ...snapshot, feeds: [...snapshot.feeds].reverse(), events: [] };
    runtime.update();
    expect(f.map.fitBounds).toHaveBeenCalledTimes(1);
    expect(f.map.panTo).not.toHaveBeenCalled();
    snapshot = { ...snapshot, selectedFeedId: cctvFeeds[1].id, onSelectFeed: vi.fn() };
    runtime.update();
    expect(f.map.panTo).toHaveBeenCalledExactlyOnceWith([cctvFeeds[1].coordinates.lat, cctvFeeds[1].coordinates.lng], { animate: false });
    const latestButton = f.markers[1].setIcon.mock.calls.at(-1)![0].html as TestElement;
    expect(latestButton.attributes["aria-pressed"]).toBe("true");
    expect(latestButton.textContent).toBe("0");
    latestButton.listeners.click();
    expect(snapshot.onSelectFeed).toHaveBeenCalledWith(cctvFeeds[1].id);
    snapshot = { ...snapshot, feeds: [...snapshot.feeds, cctvFeeds[2]] };
    runtime.update();
    expect(f.map.fitBounds).toHaveBeenCalledTimes(2);
    snapshot = { ...snapshot, feeds: snapshot.feeds.map((feed) => feed.id === cctvFeeds[0].id ? { ...feed, coordinates: { lat: 36, lng: 128 } } : feed) };
    runtime.update();
    expect(f.map.fitBounds).toHaveBeenCalledTimes(3);
  });

  it("draws only supplied valid consent position and accuracy without recentering", async () => {
    const { createRoadMap } = await import("./road-map-model");
    const f = fixture();
    let snapshot: CctvRoadMapProps = { feeds: cctvFeeds, events: [], selectedFeedId: "", onSelectFeed: vi.fn() };
    const runtime = createRoadMap(f.container as unknown as HTMLElement, f.port, () => snapshot, vi.fn());
    expect(f.leaflet.circleMarker).not.toHaveBeenCalled();
    snapshot = { ...snapshot, userPosition: { lat: 37.4, lng: 127.1, accuracyMeters: 42 } };
    runtime.update();
    expect(f.leaflet.circleMarker).toHaveBeenCalledWith([37.4, 127.1], expect.objectContaining({ interactive: false }));
    expect(f.leaflet.circle).toHaveBeenCalledWith([37.4, 127.1], expect.objectContaining({ radius: 42, interactive: false }));
    expect(f.map.panTo).not.toHaveBeenCalled();
    runtime.update();
    expect(f.leaflet.circleMarker).toHaveBeenCalledTimes(1);
    snapshot = { ...snapshot, userPosition: { lat: 37.5, lng: 127.2, accuracyMeters: -1 } };
    runtime.update();
    expect(f.leaflet.circleMarker.mock.results[0].value.remove).toHaveBeenCalledOnce();
    expect(f.leaflet.circle).toHaveBeenCalledTimes(1);
    snapshot = { ...snapshot, userPosition: undefined };
    runtime.update();
    expect(f.leaflet.circleMarker.mock.results[1].value.remove).toHaveBeenCalledOnce();
    snapshot = { ...snapshot, userPosition: { lat: NaN, lng: 127 } };
    runtime.update();
    expect(f.leaflet.circleMarker).toHaveBeenCalledTimes(2);
  });

  it("omits invalid coordinates, preserves colocated feeds, and removes vanished markers", async () => {
    const { createRoadMap } = await import("./road-map-model");
    const f = fixture();
    const invalid = [NaN, Infinity, 90].map((lat, index) => ({ ...cctvFeeds[0], id: `bad-${index}`, coordinates: { lat, lng: 127 } }));
    let snapshot = { feeds: [cctvFeeds[0], { ...cctvFeeds[1], coordinates: cctvFeeds[0].coordinates }, ...invalid], events: [], selectedFeedId: "bad-0", onSelectFeed: vi.fn() };
    const runtime = createRoadMap(f.container as unknown as HTMLElement, f.port, () => snapshot, vi.fn());
    expect(f.leaflet.marker).toHaveBeenCalledTimes(2);
    expect(f.leaflet.marker.mock.calls[1][0]).toEqual(f.leaflet.marker.mock.calls[0][0]);
    snapshot = { ...snapshot, feeds: [] };
    runtime.update();
    expect(f.markers[0].remove).toHaveBeenCalledOnce();
    expect(f.markers[1].remove).toHaveBeenCalledOnce();
    expect(f.map.panTo).not.toHaveBeenCalled();
  });

  it("reports tile failure without polling and disposes the map exactly once", async () => {
    const { createRoadMap } = await import("./road-map-model");
    const f = fixture();
    const onTileError = vi.fn();
    const runtime = createRoadMap(f.container as unknown as HTMLElement, f.port, () => ({ feeds: cctvFeeds, events: [], selectedFeedId: "", onSelectFeed: vi.fn() }), onTileError);
    expect(f.tiles.on).toHaveBeenCalledWith("tileerror", expect.any(Function));
    const fail = f.tiles.on.mock.calls[0][1] as () => void;
    fail();
    expect(onTileError).toHaveBeenCalledOnce();
    runtime.resize();
    expect(f.map.invalidateSize).toHaveBeenCalledWith({ pan: false, animate: false });
    runtime.dispose();
    runtime.dispose();
    expect(f.tiles.off).toHaveBeenCalledWith("tileerror", fail);
    expect(f.map.remove).toHaveBeenCalledOnce();
    runtime.resize();
    runtime.update();
    fail();
    expect(onTileError).toHaveBeenCalledOnce();
    expect(f.map.invalidateSize).toHaveBeenCalledOnce();
    expect(f.leaflet.tileLayer).toHaveBeenCalledOnce();
  });

  it("cancels a late dynamic import during StrictMode replay and reads latest props on resolution", async () => {
    const { startRoadMap } = await import("./road-map-model");
    const f = fixture();
    let resolve!: (value: typeof import("leaflet")) => void;
    const pending = new Promise<typeof import("leaflet")>((done) => { resolve = done; });
    let snapshot = { feeds: cctvFeeds, events: detectionEvents, selectedFeedId: cctvFeeds[0].id, onSelectFeed: vi.fn() };
    const cancelledStatus = vi.fn();
    const abandoned = startRoadMap(f.container as unknown as HTMLElement, () => pending, () => snapshot, cancelledStatus);
    abandoned.dispose();
    const status = vi.fn();
    const active = startRoadMap(f.container as unknown as HTMLElement, () => pending, () => snapshot, status);
    snapshot = { ...snapshot, selectedFeedId: cctvFeeds[1].id };
    resolve(f.port);
    await Promise.all([abandoned.ready, active.ready]);
    expect(f.leaflet.map).toHaveBeenCalledOnce();
    expect(cancelledStatus).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith("ready");
    expect((f.leaflet.divIcon.mock.calls[1][0].html as TestElement).attributes["aria-pressed"]).toBe("true");
    active.dispose();
    expect(f.map.remove).toHaveBeenCalledOnce();
  });

  it("observes container resizing without panning and disconnects on unmount", async () => {
    const { startRoadMap } = await import("./road-map-model");
    const f = fixture();
    let resize!: () => void;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    try {
      const session = startRoadMap(f.container as unknown as HTMLElement, async () => f.port, () => ({ feeds: cctvFeeds, events: [], selectedFeedId: "", onSelectFeed: vi.fn() }), vi.fn());
      await session.ready;
      expect(observe).toHaveBeenCalledWith(f.container);
      resize();
      expect(f.map.invalidateSize).toHaveBeenCalledWith({ pan: false, animate: false });
      session.dispose();
      expect(disconnect).toHaveBeenCalledOnce();
      resize();
      expect(f.map.invalidateSize).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it("cleans up a partially initialized map and exposes a safe fallback on initialization error", async () => {
    const { startRoadMap } = await import("./road-map-model");
    const f = fixture();
    f.leaflet.tileLayer.mockImplementationOnce(() => { throw new Error("tile setup failed"); });
    const status = vi.fn();
    const session = startRoadMap(f.container as unknown as HTMLElement, async () => f.port, () => ({ feeds: cctvFeeds, events: [], selectedFeedId: "", onSelectFeed: vi.fn() }), status);
    await session.ready;
    expect(status).toHaveBeenCalledExactlyOnceWith("map-error");
    expect(f.map.remove).toHaveBeenCalledOnce();
    session.dispose();
    expect(f.map.remove).toHaveBeenCalledOnce();
  });

  it("cleans up if ResizeObserver setup fails after map creation", async () => {
    const { startRoadMap } = await import("./road-map-model");
    const f = fixture();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe() { throw new Error("observer unavailable"); }
      disconnect = disconnect;
    });
    try {
      const status = vi.fn();
      const session = startRoadMap(f.container as unknown as HTMLElement, async () => f.port, () => ({ feeds: cctvFeeds, events: [], selectedFeedId: "", onSelectFeed: vi.fn() }), status);
      await session.ready;
      expect(status).toHaveBeenCalledExactlyOnceWith("map-error");
      expect(disconnect).toHaveBeenCalledOnce();
      expect(f.map.remove).toHaveBeenCalledOnce();
      session.dispose();
      expect(f.map.remove).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it("keeps rejected imports silent after unmount and reports active import failures", async () => {
    const { startRoadMap } = await import("./road-map-model");
    const f = fixture();
    const snapshot = { feeds: [], events: [], selectedFeedId: "", onSelectFeed: vi.fn() };
    const status = vi.fn();
    const active = startRoadMap(f.container as unknown as HTMLElement, async () => { throw new Error("offline"); }, () => snapshot, status);
    await active.ready;
    expect(status).toHaveBeenCalledExactlyOnceWith("map-error");
    expect(f.leaflet.map).not.toHaveBeenCalled();
    status.mockClear();
    const cancelled = startRoadMap(f.container as unknown as HTMLElement, async () => { throw new Error("offline"); }, () => snapshot, status);
    cancelled.dispose();
    await cancelled.ready;
    expect(status).not.toHaveBeenCalled();
  });

  it("surfaces tile errors through the async boundary while retaining marker selection", async () => {
    const { startRoadMap } = await import("./road-map-model");
    const f = fixture();
    const status = vi.fn();
    const onSelectFeed = vi.fn();
    const active = startRoadMap(f.container as unknown as HTMLElement, async () => f.port, () => ({ feeds: cctvFeeds, events: detectionEvents, selectedFeedId: "", onSelectFeed }), status);
    await active.ready;
    (f.tiles.on.mock.calls[0][1] as () => void)();
    expect(status).toHaveBeenLastCalledWith("tile-error");
    (f.leaflet.divIcon.mock.calls[0][0].html as TestElement).listeners.click();
    expect(onSelectFeed).toHaveBeenCalledWith(cctvFeeds[0].id);
    active.dispose();
  });

  it("keeps a clear list-selection fallback instruction for tile and map errors", async () => {
    const { getRoadMapStatusText } = await import("./road-map-model");
    expect(getRoadMapStatusText("tile-error")).toContain("지도 타일을 불러오지 못했습니다");
    expect(getRoadMapStatusText("tile-error")).toContain("목록에서 CCTV를 선택");
    expect(getRoadMapStatusText("map-error")).toContain("목록에서 CCTV를 선택");
    expect(getRoadMapStatusText("loading")).toBe("지도 불러오는 중");
  });
});
