"use client";

import { useMemo, useState } from "react";

import { VideoPlayer } from "@/components/video-player";
import type { CctvSnapshot } from "@/lib/cctv-api";
import { mergeCctvSnapshot } from "@/lib/cctv-api";
import {
  getControlRoomSummary,
  getTopPriorityEvents,
  type CctvFeed,
  type DetectionEvent,
  type EventSeverity,
  type FeedStatus,
  type ReviewStatus,
} from "@/lib/cctv";
import {
  filterFeedsByStatus,
  getEventsForFeed,
  getNextSelectedFeedId,
  updateEventReviewStatus,
  type FeedStatusFilter,
} from "@/lib/dashboard";

const statusLabel: Record<FeedStatus, string> = {
  online: "정상",
  degraded: "지연",
  offline: "끊김",
};

const statusClass: Record<FeedStatus, string> = {
  online: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  degraded: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  offline: "border-rose-400/40 bg-rose-400/10 text-rose-200",
};

const severityClass: Record<EventSeverity, string> = {
  critical: "border-rose-400/50 bg-rose-500/15 text-rose-100",
  warning: "border-amber-400/50 bg-amber-500/15 text-amber-100",
  info: "border-sky-400/50 bg-sky-500/15 text-sky-100",
};

const reviewLabel: Record<ReviewStatus, string> = {
  needs_review: "검토 필요",
  confirmed: "확인됨",
  dismissed: "오탐",
};

const filterOptions: Array<{ label: string; value: FeedStatusFilter }> = [
  { label: "전체", value: "all" },
  { label: "정상", value: "online" },
  { label: "지연", value: "degraded" },
  { label: "끊김", value: "offline" },
];

export function ControlRoomDashboard({
  initialFeeds,
  initialEvents,
}: {
  initialFeeds: CctvFeed[];
  initialEvents: DetectionEvent[];
}) {
  const [feeds, setFeeds] = useState(initialFeeds);
  const [events, setEvents] = useState(initialEvents);
  const [selectedFeedId, setSelectedFeedId] = useState(initialFeeds[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState<FeedStatusFilter>("all");
  const [apiStatus, setApiStatus] = useState("mock API 대기 중");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const visibleFeeds = useMemo(
    () => filterFeedsByStatus(feeds, statusFilter),
    [feeds, statusFilter],
  );
  const selectedFeed =
    feeds.find((feed) => feed.id === selectedFeedId) ?? visibleFeeds[0] ?? feeds[0];
  const selectedFeedEvents = selectedFeed ? getEventsForFeed(events, selectedFeed.id) : [];
  const priorityEvents = getTopPriorityEvents(events, 4);
  const summary = getControlRoomSummary(feeds, events);

  function handleFilterChange(nextFilter: FeedStatusFilter) {
    const nextVisibleFeeds = filterFeedsByStatus(feeds, nextFilter);

    setStatusFilter(nextFilter);
    setSelectedFeedId((currentFeedId) => getNextSelectedFeedId(nextVisibleFeeds, currentFeedId));
  }

  function handleReview(eventId: string, reviewStatus: ReviewStatus) {
    setEvents((currentEvents) => updateEventReviewStatus(currentEvents, eventId, reviewStatus));
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    setApiStatus("mock API 갱신 중");

    try {
      const response = await fetch("/api/cctv", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const snapshot = (await response.json()) as CctvSnapshot;
      const mergedSnapshot = mergeCctvSnapshot(snapshot, events);
      const nextVisibleFeeds = filterFeedsByStatus(mergedSnapshot.feeds, statusFilter);

      setFeeds(mergedSnapshot.feeds);
      setEvents(mergedSnapshot.events);
      setSelectedFeedId((currentFeedId) => getNextSelectedFeedId(nextVisibleFeeds, currentFeedId));
      setApiStatus(`${snapshot.meta.source} API 갱신 완료 · ${snapshot.meta.generatedAt.slice(11, 19)}`);
    } catch (error) {
      setApiStatus(error instanceof Error ? `갱신 실패 · ${error.message}` : "갱신 실패");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#071017] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-6 px-5 py-5 lg:px-8">
        <Header apiStatus={apiStatus} isRefreshing={isRefreshing} onRefresh={handleRefresh} />
        <SummaryCards summary={summary} />

        <section className="grid flex-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
          <FeedList
            feeds={visibleFeeds}
            selectedFeedId={selectedFeed?.id ?? ""}
            statusFilter={statusFilter}
            onSelectFeed={setSelectedFeedId}
            onFilterChange={handleFilterChange}
          />
          {selectedFeed ? (
            <VideoWorkspace feed={selectedFeed} events={selectedFeedEvents} />
          ) : (
            <EmptyPanel />
          )}
          <EventPanel events={priorityEvents} feeds={feeds} onReview={handleReview} />
        </section>
      </div>
    </main>
  );
}

function Header({
  apiStatus,
  isRefreshing,
  onRefresh,
}: {
  apiStatus: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-cyan-300">Highway CCTV AI · MVP 관제 프로토타입</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
            AI가 의심 이벤트를 정리하고, 운영자가 빠르게 확인합니다.
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{apiStatus}</span>
            <button
              className="rounded-full bg-cyan-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={isRefreshing}
              onClick={onRefresh}
            >
              {isRefreshing ? "갱신 중" : "mock API 갱신"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[520px]">
          <Badge label="저장" value="비활성" tone="safe" />
          <Badge label="출처" value="표시" tone="safe" />
          <Badge label="판정" value="후보" tone="warn" />
          <Badge label="연결" value="mock" tone="info" />
        </div>
      </div>
    </header>
  );
}

function SummaryCards({ summary }: { summary: ReturnType<typeof getControlRoomSummary> }) {
  const cards = [
    { label: "CCTV 피드", value: summary.totalFeeds, helper: `${summary.onlineFeeds} 정상 · ${summary.degradedFeeds} 지연` },
    { label: "AI 이벤트 후보", value: summary.activeEvents, helper: `${summary.criticalEvents} 긴급 · ${summary.needsReview} 검토 필요` },
    { label: "오프라인", value: summary.offlineFeeds, helper: "끊김/권한/URL 만료 확인" },
    { label: "평균 대응 목표", value: "80초", helper: "확정 전 운영자 검토" },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">{card.label}</p>
          <strong className="mt-2 block text-3xl font-semibold text-white">{card.value}</strong>
          <p className="mt-2 text-sm text-slate-400">{card.helper}</p>
        </article>
      ))}
    </section>
  );
}

function FeedList({
  feeds,
  selectedFeedId,
  statusFilter,
  onSelectFeed,
  onFilterChange,
}: {
  feeds: CctvFeed[];
  selectedFeedId: string;
  statusFilter: FeedStatusFilter;
  onSelectFeed: (feedId: string) => void;
  onFilterChange: (filter: FeedStatusFilter) => void;
}) {
  return (
    <aside className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">CCTV 목록</h2>
          <p className="text-sm text-slate-400">소수 샘플로 연결 안정성부터 검증</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{feeds.length}개</span>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2 text-xs">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            className={`rounded-full px-3 py-2 transition ${
              statusFilter === option.value ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-slate-300"
            }`}
            type="button"
            onClick={() => onFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {feeds.map((feed) => (
          <button
            key={feed.id}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              feed.id === selectedFeedId
                ? "border-cyan-300/60 bg-cyan-300/10"
                : "border-white/10 bg-white/[0.03] hover:border-white/25"
            }`}
            type="button"
            onClick={() => onSelectFeed(feed.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-white">{feed.name}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {feed.route} · {feed.direction}
                </p>
              </div>
              <StatusPill status={feed.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
              <span>형식 {feed.streamType}</span>
              <span>지연 {feed.latencySeconds}s</span>
              <span>{feed.coordinates.lat.toFixed(3)}</span>
              <span>{feed.coordinates.lng.toFixed(3)}</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function VideoWorkspace({ feed, events }: { feed: CctvFeed; events: DetectionEvent[] }) {
  const visibleEvents = events.length > 0 ? events : [];

  return (
    <section className="flex min-h-[680px] flex-col rounded-[2rem] border border-white/10 bg-slate-950/80 p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{feed.name} 라이브 검토</h2>
          <p className="text-sm text-slate-400">
            {feed.location} · {feed.source} · 마지막 확인 {feed.lastCheckedAt}
          </p>
        </div>
        <StatusPill status={feed.status} />
      </div>

      <VideoPlayer feed={feed} />

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {visibleEvents.length > 0 ? (
          visibleEvents.slice(0, 3).map((event) => (
            <article key={event.id} className={`rounded-2xl border p-4 ${severityClass[event.severity]}`}>
              <p className="text-xs opacity-75">{event.detectedAt}</p>
              <h3 className="mt-1 font-semibold">{event.label}</h3>
              <p className="mt-2 text-sm opacity-80">신뢰도 {(event.confidence * 100).toFixed(0)}%</p>
            </article>
          ))
        ) : (
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400 md:col-span-3">
            선택한 CCTV에 연결된 이벤트 후보가 아직 없습니다.
          </article>
        )}
      </div>
    </section>
  );
}

function EventPanel({
  events,
  feeds,
  onReview,
}: {
  events: DetectionEvent[];
  feeds: CctvFeed[];
  onReview: (eventId: string, reviewStatus: ReviewStatus) => void;
}) {
  return (
    <aside className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">AI 이벤트 후보</h2>
        <p className="text-sm text-slate-400">확정 판정 전, 근거와 함께 운영자 검토</p>
      </div>

      <div className="space-y-3">
        {events.map((event) => {
          const feed = feeds.find((item) => item.id === event.feedId);

          return (
            <article key={event.id} className={`rounded-2xl border p-4 ${severityClass[event.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs opacity-70">{event.detectedAt}</p>
                  <h3 className="mt-1 font-semibold">{event.label}</h3>
                  <p className="mt-1 text-sm opacity-80">{feed?.name ?? "알 수 없음"}</p>
                </div>
                <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{reviewLabel[event.reviewStatus]}</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm opacity-85">
                {event.evidence.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <ReviewButton active={event.reviewStatus === "confirmed"} onClick={() => onReview(event.id, "confirmed")}>
                  확인
                </ReviewButton>
                <ReviewButton active={event.reviewStatus === "dismissed"} onClick={() => onReview(event.id, "dismissed")}>
                  오탐
                </ReviewButton>
                <ReviewButton active={event.reviewStatus === "needs_review"} onClick={() => onReview(event.id, "needs_review")}>
                  보류
                </ReviewButton>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function ReviewButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full px-3 py-2 transition ${
        active ? "bg-white text-slate-950" : "bg-white/10 hover:bg-white/20"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EmptyPanel() {
  return (
    <section className="flex min-h-[680px] items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950/80 p-4 text-slate-400">
      표시할 CCTV가 없습니다.
    </section>
  );
}

function StatusPill({ status }: { status: FeedStatus }) {
  return <span className={`rounded-full border px-3 py-1 text-xs ${statusClass[status]}`}>{statusLabel[status]}</span>;
}

function Badge({ label, value, tone }: { label: string; value: string; tone: "safe" | "warn" | "info" }) {
  const className = {
    safe: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
