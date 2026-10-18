"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { CctvFeed } from "@/lib/cctv";
import {
  addSavedTV, createMonitorMetadataSession, createMonitorStore, lookupSavedTV,
  MAX_MONITOR_TVS, MONITOR_STORAGE_UNAVAILABLE, parseSavedTVs, removeSavedTV,
  reorderSavedTV, type MonitorMetadata, type SavedTV,
} from "@/lib/monitor-wall";
import { buildNearbyBounds, buildNearbyQuery } from "@/lib/nearby-cctv";
import { VideoPlayer } from "./video-player";

const store = createMonitorStore();
const buttonClass = "border border-[#c6c6c6] bg-white px-3 py-2 text-sm text-[#161616] hover:bg-[#e8e8e8] disabled:cursor-not-allowed disabled:text-[#8d8d8d]";
const storageError = "브라우저 저장소에 저장하지 못했습니다. 저장 공간과 개인정보 보호 설정을 확인한 뒤 다시 시도하세요.";

function useSavedTVs() {
  const raw = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { tvs: useMemo(() => parseSavedTVs(raw), [raw]), unavailable: raw === MONITOR_STORAGE_UNAVAILABLE };
}

export function MonitorAddButton({ feed }: { feed: CctvFeed }) {
  const { tvs, unavailable } = useSavedTVs();
  const [message, setMessage] = useState("");
  const saved = tvs.some((tv) => !!lookupSavedTV(tv, [feed]));
  const full = tvs.length >= MAX_MONITOR_TVS;
  function add() {
    const result = store.update((current) => addSavedTV(current, feed));
    setMessage(!result.ok ? storageError : result.changed ? "모니터에 추가했습니다." : "이미 추가되었거나 최대 4대에 도달했습니다.");
  }
  return (
    <div className="min-w-0">
      <button type="button" onClick={add} disabled={saved || full || unavailable} className={buttonClass}>
        {saved ? "모니터에 추가됨" : full ? "최대 4대 · 선택 제거 후 추가" : "모니터에 추가"}
      </button>
      {unavailable ? <p role="alert" className="mt-2 text-sm text-[#a2191f]">{storageError}</p> : null}
      {message ? <p role="status" className="mt-2 text-sm text-[#525252]">{message}</p> : null}
    </div>
  );
}

/** Called only by a card's explicit refresh action; browser/default server TTL is preserved. */
export async function loadMonitorFeed(tv: SavedTV, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CctvFeed | undefined> {
  const response = await fetcher(buildNearbyQuery(buildNearbyBounds(tv.coordinates)), { signal });
  if (!response.ok) throw new Error("CCTV metadata unavailable");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { feeds?: unknown }).feeds)) throw new Error("Invalid CCTV metadata");
  const feeds = (payload as { feeds: unknown[] }).feeds.filter(isFeedIdentity);
  return lookupSavedTV(tv, feeds);
}

function isFeedIdentity(value: unknown): value is CctvFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as CctvFeed;
  return typeof feed.name === "string" && typeof feed.id === "string"
    && !!feed.coordinates && Number.isFinite(feed.coordinates.lat) && Number.isFinite(feed.coordinates.lng)
    && ["online", "degraded", "offline", "unverified"].includes(feed.status)
    && ["HLS", "HTTPS HLS", "MP4", "HTTPS MP4", "SNAPSHOT"].includes(feed.streamType)
    && (feed.streamUrl === undefined || typeof feed.streamUrl === "string");
}

export function MonitorWall() {
  const { tvs, unavailable } = useSavedTVs();
  const [message, setMessage] = useState("");
  function change(update: (current: SavedTV[]) => SavedTV[]) {
    const result = store.update(update);
    setMessage(result.ok ? "" : storageError);
    return result.ok;
  }
  return (
    <section aria-labelledby="monitor-wall-title" className="min-w-0">
      <div className="mb-6 border-b border-[#c6c6c6] pb-5">
        <p className="text-xs text-[#525252]">선택 CCTV 전용 화면</p>
        <h1 id="monitor-wall-title" className="mt-2 text-2xl font-medium text-[#161616]">모니터 벽</h1>
        <p className="mt-3 text-sm leading-6 text-[#525252]">최대 4대 · 선택과 순서는 이 브라우저에 보관됩니다. 영상 주소는 저장하지 않습니다.</p>
        <p className="mt-1 text-sm leading-6 text-[#525252]">각 카드의 정보 갱신을 눌러 영상 정보를 조회한 뒤 영상 연결 시작을 선택하세요. 자동 조회·자동 재생·위치 요청은 하지 않습니다.</p>
        <p className="mt-1 text-xs leading-5 text-[#6f6f6f]">조회에는 저장한 CCTV 지점 주변의 구역만 사용합니다. 서버 캐시 때문에 같은 정보가 반환될 수 있습니다. 실제 영상은 감지 시각의 녹화 영상이 아니며 저장·분석하지 않습니다.</p>
      </div>
      {unavailable || message ? <p role="alert" className="mb-4 border border-[#da1e28] bg-white p-3 text-sm text-[#a2191f]">{message || storageError}</p> : null}
      {tvs.length === 0 ? (
        <div className="border border-[#c6c6c6] bg-white p-6">
          <h2 className="font-medium">선택한 CCTV가 없습니다</h2>
          <p className="mt-2 text-sm text-[#525252]">관제 화면에서 CCTV를 추가한 뒤 이 화면으로 돌아오세요.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-[#0f62fe] underline">관제 CCTV 선택으로 이동</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {tvs.map((tv, index) => <MonitorCard key={tv.key} tv={tv} first={index === 0} last={index === tvs.length - 1} onMove={(direction) => change((current) => reorderSavedTV(current, tv.key, direction))} onRemove={() => change((current) => removeSavedTV(current, tv.key))} />)}
        </div>
      )}
    </section>
  );
}

function MonitorCard({ tv, first, last, onMove, onRemove }: {
  tv: SavedTV;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => boolean;
  onRemove: () => boolean;
}) {
  const [metadata, setMetadata] = useState<MonitorMetadata>({ status: "idle" });
  // Identity is fixed by the React card key; reordering never starts a request.
  const [session] = useState(() => createMonitorMetadataSession(tv, loadMonitorFeed, setMetadata));
  useEffect(() => () => session.stop(), [session]);
  const statusText = metadata.status === "loading" ? "영상 정보 조회 중"
    : metadata.status === "missing" ? "이 지점의 정보를 찾지 못했습니다. 선택은 유지됩니다. 관제 화면에서 지점을 다시 확인하세요."
    : metadata.status === "error" ? "영상 정보를 가져오지 못했습니다. 잠시 뒤 정보 갱신을 다시 누르세요."
    : metadata.status === "ready" ? "영상 정보 수신 · 실제 재생 상태는 영상 연결 후 확인하세요."
    : "정보 갱신 전 · 영상에 연결하지 않았습니다.";
  return (
    <article aria-label={`${tv.name} 모니터`} className="min-w-0 overflow-hidden border border-[#c6c6c6] bg-white">
      <header className="border-b border-[#e0e0e0] p-4">
        <h2 className="break-words text-lg font-medium text-[#161616]">{tv.name}</h2>
        <p className="mt-1 break-words text-sm text-[#525252]">{tv.route}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-label={`${tv.name} 위로`} disabled={first} onClick={() => onMove(-1)} className={buttonClass}>위로</button>
          <button type="button" aria-label={`${tv.name} 아래로`} disabled={last} onClick={() => onMove(1)} className={buttonClass}>아래로</button>
          <button type="button" aria-label={`${tv.name} 선택 제거`} onClick={() => { if (onRemove()) session.stop(); }} className={buttonClass}>선택 제거</button>
          <button type="button" aria-label={`${tv.name} 정보 갱신`} disabled={metadata.status === "loading"} onClick={() => { void session.refresh(); }} className={`${buttonClass} text-[#0f62fe]`}>정보 갱신</button>
        </div>
      </header>
      <p role="status" aria-live="polite" className="px-4 py-3 text-sm leading-5 text-[#525252]">{statusText}</p>
      {metadata.status === "ready" ? <VideoPlayer feed={metadata.feed} /> : <div className="flex min-h-64 items-center justify-center bg-[#e8e8e8] p-6 text-center text-sm text-[#525252]">정보 갱신 후 영상 연결을 시작할 수 있습니다.</div>}
    </article>
  );
}
