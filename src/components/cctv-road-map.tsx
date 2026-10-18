"use client";

import { useEffect, useRef, useState } from "react";
import type { CctvFeed, DetectionEvent } from "@/lib/cctv";
import { getFeedEventMarker } from "@/lib/workspace-selection";
import { getRoadMapStatusText, isRoadMapPosition, startRoadMap, type RoadMapStatus } from "@/lib/road-map-model";
import "leaflet/dist/leaflet.css";
import styles from "./cctv-road-map.module.css";

export type CctvRoadMapProps = {
  feeds: CctvFeed[];
  events: DetectionEvent[];
  selectedFeedId: string;
  onSelectFeed: (id: string) => void;
  /** Supplied only after parent-owned consent; never acquired or persisted here. */
  userPosition?: { lat: number; lng: number; accuracyMeters?: number };
};

const statusLabels = { online: "연결 정상", degraded: "연결 지연", offline: "연결 끊김", unverified: "재생 미확인" };
const severityLabels = { critical: "긴급", warning: "주의", info: "참고" };

export function CctvRoadMap(props: CctvRoadMapProps) {
  const { feeds, events, selectedFeedId, onSelectFeed, userPosition } = props;
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const session = useRef<ReturnType<typeof startRoadMap> | null>(null);
  const [status, setStatus] = useState<RoadMapStatus>("loading");

  // Commit the latest props before either updating the map or resolving its import.
  // Do not recreate the map for selection, event review, or metadata refreshes.
  useEffect(() => {
    latest.current = props;
    session.current?.update();
  }, [props]);

  useEffect(() => {
    if (!container.current) return;
    const active = startRoadMap(container.current, () => import("leaflet"), () => latest.current, setStatus);
    session.current = active;
    return () => {
      active.dispose();
      if (session.current === active) session.current = null;
    };
  }, []);

  const failed = status === "tile-error" || status === "map-error";
  const unavailableCount = feeds.filter((feed) => !isRoadMapPosition(feed.coordinates)).length;
  return (
    <section className={styles.root} aria-label="CCTV 도로 지도">
      <div className={styles.heading}>
        <strong>도로 지도</strong><span>CCTV {feeds.length}개 · OpenStreetMap</span>
      </div>
      <div ref={container} className={styles.canvas} role="region" aria-label="드래그 및 확대 가능한 CCTV 지도" />
      <p role="status" className={styles.status} data-error={failed || undefined}>{getRoadMapStatusText(status)}</p>
      <p className={styles.attribution}>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></p>
      <div className={styles.legend}>
        <span>테두리: 선택 · 배경: 후보 긴급도 · 점: 영상 연결 상태</span>
        <span>겹친 지점은 아래 목록에서 선택</span>
        {userPosition && isRoadMapPosition(userPosition) && <span>파란 점: 동의한 내 위치{typeof userPosition.accuracyMeters === "number" && Number.isFinite(userPosition.accuracyMeters) && userPosition.accuracyMeters >= 0 ? ` · 정확도 ±${Math.round(userPosition.accuracyMeters)}m` : ""}</span>}
        {unavailableCount > 0 && <span>좌표를 표시할 수 없는 지점 {unavailableCount}개 · 목록에서 선택 가능</span>}
      </div>
      <details className={styles.locations} open={failed || undefined}>
        <summary>CCTV 지점 목록 · {feeds.length}개</summary>
        {feeds.length === 0 && <p>표시할 CCTV 지점이 없습니다.</p>}
        <ul>
          {feeds.map((feed) => {
            const marker = getFeedEventMarker(events, feed.id);
            return <li key={feed.id}>
              <button type="button" aria-label={`지도에서 ${feed.name} 선택`} aria-pressed={feed.id === selectedFeedId} onClick={() => onSelectFeed(feed.id)}>
                <strong>{feed.name}</strong><span>{feed.source}</span>
                <span>{statusLabels[feed.status]}</span>
                <span data-severity={marker.severity}>감지 후보 {marker.count}건 · 검토 {marker.needsReview}건{marker.severity ? ` · ${severityLabels[marker.severity]}` : ""}</span>
              </button>
            </li>;
          })}
        </ul>
      </details>
    </section>
  );
}
