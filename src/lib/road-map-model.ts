import type * as Leaflet from "leaflet";
import type { CctvRoadMapProps } from "@/components/cctv-road-map";
import { getFeedEventMarker } from "@/lib/workspace-selection";

/** Replace deliberately with an approved provider; no env-driven third-party URL. */
export const DEFAULT_ROAD_MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

export type RoadMapStatus = "loading" | "ready" | "tile-error" | "map-error";

export function getRoadMapStatusText(status: RoadMapStatus): string {
  return {
    loading: "지도 불러오는 중",
    ready: "드래그로 이동 · + / −로 확대 및 축소 · 숫자는 오탐 제외 감지 후보 건수",
    "tile-error": "지도 타일을 불러오지 못했습니다. 아래 목록에서 CCTV를 선택할 수 있습니다.",
    "map-error": "지도를 시작하지 못했습니다. 아래 목록에서 CCTV를 선택할 수 있습니다.",
  }[status];
}

/** Owns the asynchronous module boundary; cancelled imports never create a map. */
export function startRoadMap(
  container: HTMLElement,
  load: () => Promise<typeof Leaflet>,
  read: () => CctvRoadMapProps,
  onStatus: (status: RoadMapStatus) => void,
) {
  let disposed = false;
  let runtime: ReturnType<typeof createRoadMap> | undefined;
  let observer: ResizeObserver | undefined;
  const ready = Promise.resolve().then(load).then((L) => {
    if (disposed) return;
    let tileFailed = false;
    runtime = createRoadMap(container, L, read, () => {
      if (!disposed) { tileFailed = true; onStatus("tile-error"); }
    });
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => { if (!disposed) runtime?.resize(); });
      observer.observe(container);
    }
    if (!tileFailed) onStatus("ready");
  }).catch(() => {
    observer?.disconnect();
    observer = undefined;
    runtime?.dispose();
    runtime = undefined;
    if (!disposed) onStatus("map-error");
  });
  return {
    ready,
    update() { runtime?.update(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      runtime?.dispose();
    },
  };
}

export function isRoadMapPosition(position: { lat: number; lng: number }): boolean {
  return Number.isFinite(position.lat) && Number.isFinite(position.lng)
    && Math.abs(position.lat) <= 85.05112878 && Math.abs(position.lng) <= 180;
}

export function createRoadMap(
  container: HTMLElement,
  L: typeof Leaflet,
  read: () => CctvRoadMapProps,
  onTileError: () => void,
) {
  let disposed = false;
  const map = L.map(container, { dragging: true, keyboard: true, zoomControl: true });
  try {
    map.attributionControl.setPrefix(false);
    const tiles = L.tileLayer(DEFAULT_ROAD_MAP_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
      keepBuffer: 0,
      updateWhenIdle: true,
    }).addTo(map);
    const handleTileError = () => { if (!disposed) onTileError(); };
    tiles.on("tileerror", handleTileError);
    const markers = new Map<string, { marker: Leaflet.Marker; signature: string }>();
    let coordinatesKey: string | undefined;
    let selectionKey: string | undefined;
    let positionKey: string | undefined;
    let positionLayers: Leaflet.Layer[] = [];

    function update() {
      if (disposed) return;
      const snapshot = read();
      const position = snapshot.userPosition;
      const nextPositionKey = JSON.stringify(position ?? null);
      if (positionKey !== nextPositionKey) {
        positionLayers.forEach((layer) => layer.remove());
        positionLayers = [];
        if (position && isRoadMapPosition(position)) {
          const point: Leaflet.LatLngTuple = [position.lat, position.lng];
          if (Number.isFinite(position.accuracyMeters) && position.accuracyMeters! >= 0) {
            positionLayers.push(L.circle(point, { radius: position.accuracyMeters, color: "#0f62fe", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map));
          }
          positionLayers.push(L.circleMarker(point, { radius: 6, color: "#fff", weight: 2, fillColor: "#0f62fe", fillOpacity: 1, interactive: false }).addTo(map));
        }
        positionKey = nextPositionKey;
      }
      const feeds = snapshot.feeds.filter((feed) => isRoadMapPosition(feed.coordinates));
      const ids = new Set(feeds.map((feed) => feed.id));
      for (const [id, entry] of markers) {
        if (!ids.has(id)) { entry.marker.remove(); markers.delete(id); }
      }
      for (const feed of feeds) {
        const badge = getFeedEventMarker(snapshot.events, feed.id);
        const selected = feed.id === snapshot.selectedFeedId;
        const point: Leaflet.LatLngTuple = [feed.coordinates.lat, feed.coordinates.lng];
        const signature = JSON.stringify([feed.name, feed.source, feed.status, badge, selected, point]);
        const previous = markers.get(feed.id);
        if (previous?.signature === signature) continue;
        const button = container.ownerDocument.createElement("button");
        button.setAttribute("type", "button");
        button.setAttribute("aria-label", `지도에서 ${feed.name} 선택`);
        button.setAttribute("aria-pressed", String(selected));
        button.className = "cctv-road-map-pin";
        button.dataset.status = feed.status;
        button.dataset.severity = badge.severity ?? "none";
        button.textContent = String(badge.count);
        button.addEventListener("click", () => read().onSelectFeed(feed.id));
        const icon = L.divIcon({ html: button, className: "cctv-road-map-icon", iconSize: [44, 44], iconAnchor: [22, 22] });
        const tooltip = container.ownerDocument.createElement("span");
        tooltip.textContent = `${feed.name} · ${feed.source} · 감지 후보 ${badge.count}건 · 검토 ${badge.needsReview}건`;
        const marker = previous?.marker ?? L.marker(point, { icon, keyboard: false, zIndexOffset: selected ? 1000 : 0, bubblingMouseEvents: false }).addTo(map);
        if (previous) marker.setIcon(icon).setLatLng(point).setZIndexOffset(selected ? 1000 : 0).unbindTooltip();
        marker.bindTooltip(tooltip, { permanent: selected, direction: "top", offset: [0, -16] });
        markers.set(feed.id, { marker, signature });
      }
      const nextCoordinatesKey = JSON.stringify(feeds.map((feed) => [feed.id, feed.coordinates.lat, feed.coordinates.lng]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      const selected = feeds.find((feed) => feed.id === snapshot.selectedFeedId);
      const nextSelectionKey = JSON.stringify(selected ? [selected.id, selected.coordinates.lat, selected.coordinates.lng] : null);
      if (coordinatesKey !== nextCoordinatesKey) {
        if (feeds.length) {
          map.fitBounds(feeds.map((feed) => [feed.coordinates.lat, feed.coordinates.lng] as Leaflet.LatLngTuple), { padding: [36, 36], maxZoom: 14, animate: false });
        } else if (coordinatesKey === undefined) {
          map.setView([36.4, 127.8], 7);
        }
      } else if (selectionKey !== nextSelectionKey && selected) {
        map.panTo([selected.coordinates.lat, selected.coordinates.lng], { animate: false });
      }
      coordinatesKey = nextCoordinatesKey;
      selectionKey = nextSelectionKey;
    }
    update();
    return {
      update,
      resize() { if (!disposed) map.invalidateSize({ pan: false, animate: false }); },
      dispose() {
        if (disposed) return;
        disposed = true;
        tiles.off("tileerror", handleTileError);
        map.remove();
        markers.clear();
        positionLayers = [];
      },
    };
  } catch (error) {
    map.remove();
    throw error;
  }
}
