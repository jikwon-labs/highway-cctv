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
  online: "border-[#24a148] bg-[#defbe6] text-[#0e6027]",
  degraded: "border-[#f1c21b] bg-[#fcf4d6] text-[#684e00]",
  offline: "border-[#da1e28] bg-[#fff1f1] text-[#a2191f]",
};

const severityClass: Record<EventSeverity, string> = {
  critical: "border-[#da1e28] bg-white text-[#161616]",
  warning: "border-[#f1c21b] bg-white text-[#161616]",
  info: "border-[#0f62fe] bg-white text-[#161616]",
};

const severityBarClass: Record<EventSeverity, string> = {
  critical: "bg-[#da1e28]",
  warning: "bg-[#f1c21b]",
  info: "bg-[#0f62fe]",
};

const reviewLabel: Record<ReviewStatus, string> = {
  needs_review: "검토 대기",
  confirmed: "확인",
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
  const [apiStatus, setApiStatus] = useState("mock 데이터 사용 중");
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
    setApiStatus("데이터 갱신 중");

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
      setApiStatus(`${snapshot.meta.source} · ${snapshot.meta.generatedAt.slice(11, 19)} 갱신`);
    } catch (error) {
      setApiStatus(error instanceof Error ? `갱신 실패 · ${error.message}` : "갱신 실패");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f4f4] text-[#161616]">
      <Header apiStatus={apiStatus} isRefreshing={isRefreshing} onRefresh={handleRefresh} />

      <div className="mx-auto flex min-h-screen w-full max-w-[1584px] flex-col gap-4 px-4 py-4 md:px-8">
        <SummaryCards summary={summary} />

        <section className="grid flex-1 gap-4 xl:grid-cols-[336px_minmax(0,1fr)_392px]">
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
    <header className="border-b border-[#393939] bg-[#161616] text-white">
      <div className="mx-auto flex max-w-[1584px] flex-col gap-5 px-4 py-5 md:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs text-[#c6c6c6]">Highway CCTV Control</p>
          <h1 className="text-3xl font-normal tracking-[-0.03em] md:text-5xl">고속도로 CCTV 관제</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#c6c6c6] md:text-base">
            공개 CCTV 상태와 감지 후보를 한 화면에서 확인합니다. 자동 판정은 하지 않고, 운영자가 직접 확인합니다.
          </p>
        </div>

        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center">
          <span className="border border-[#525252] px-3 py-2 text-[#e0e0e0]">{apiStatus}</span>
          <button
            className="bg-[#0f62fe] px-4 py-3 font-medium text-white transition hover:bg-[#0043ce] disabled:cursor-not-allowed disabled:bg-[#6f6f6f]"
            type="button"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            {isRefreshing ? "갱신 중" : "데이터 갱신"}
          </button>
        </div>
      </div>
    </header>
  );
}

function SummaryCards({ summary }: { summary: ReturnType<typeof getControlRoomSummary> }) {
  const cards = [
    { label: "CCTV", value: summary.totalFeeds, helper: `${summary.onlineFeeds} 정상, ${summary.degradedFeeds} 지연` },
    { label: "감지 후보", value: summary.activeEvents, helper: `${summary.criticalEvents} 긴급, ${summary.needsReview} 검토 대기` },
    { label: "끊김", value: summary.offlineFeeds, helper: "URL 만료 또는 접근 실패" },
    { label: "운영 기준", value: "검토", helper: "사람 확인 전 확정하지 않음" },
  ];

  return (
    <section className="grid gap-px border border-[#e0e0e0] bg-[#e0e0e0] md:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="bg-white p-4 md:p-5">
          <p className="font-mono text-xs text-[#525252]">{card.label}</p>
          <strong className="mt-3 block text-3xl font-normal text-[#161616]">{card.value}</strong>
          <p className="mt-2 text-sm text-[#525252]">{card.helper}</p>
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
    <aside className="border border-[#e0e0e0] bg-white">
      <PanelHeader title="CCTV" description="소수 지점으로 연결 상태를 확인합니다." count={`${feeds.length}개`} />

      <div className="grid grid-cols-4 border-b border-[#e0e0e0] text-sm">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            className={`border-r border-[#e0e0e0] px-3 py-3 text-left last:border-r-0 ${
              statusFilter === option.value ? "bg-[#edf5ff] text-[#0f62fe]" : "text-[#525252] hover:bg-[#f4f4f4]"
            }`}
            type="button"
            onClick={() => onFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div>
        {feeds.map((feed) => (
          <button
            key={feed.id}
            className={`block w-full border-b border-[#e0e0e0] p-4 text-left transition last:border-b-0 ${
              feed.id === selectedFeedId ? "bg-[#edf5ff]" : "bg-white hover:bg-[#f4f4f4]"
            }`}
            type="button"
            onClick={() => onSelectFeed(feed.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-[#161616]">{feed.name}</h3>
                <p className="mt-1 text-sm text-[#525252]">
                  {feed.route} · {feed.direction}
                </p>
              </div>
              <StatusPill status={feed.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-y-1 font-mono text-xs text-[#6f6f6f]">
              <span>{feed.streamType}</span>
              <span>{feed.latencySeconds}s</span>
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
    <section className="flex min-h-[680px] flex-col border border-[#e0e0e0] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e0e0e0] p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs text-[#525252]">선택 지점</p>
          <h2 className="mt-1 text-2xl font-normal text-[#161616]">{feed.name}</h2>
          <p className="mt-2 text-sm text-[#525252]">
            {feed.location} · {feed.source} · {feed.lastCheckedAt}
          </p>
        </div>
        <StatusPill status={feed.status} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <VideoPlayer feed={feed} />

        <div className="mt-4 grid gap-px border border-[#e0e0e0] bg-[#e0e0e0] md:grid-cols-3">
          {visibleEvents.length > 0 ? (
            visibleEvents.slice(0, 3).map((event) => (
              <article key={event.id} className="bg-white p-4">
                <div className={`mb-3 h-1 w-8 ${severityBarClass[event.severity]}`} />
                <p className="font-mono text-xs text-[#525252]">{event.detectedAt}</p>
                <h3 className="mt-2 font-medium text-[#161616]">{event.label}</h3>
                <p className="mt-2 text-sm text-[#525252]">신뢰도 {(event.confidence * 100).toFixed(0)}%</p>
              </article>
            ))
          ) : (
            <article className="bg-white p-4 text-sm text-[#525252] md:col-span-3">
              이 지점에 연결된 감지 후보가 없습니다.
            </article>
          )}
        </div>
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
    <aside className="border border-[#e0e0e0] bg-white">
      <PanelHeader title="감지 후보" description="확정 전 확인이 필요한 항목입니다." count={`${events.length}건`} />

      <div>
        {events.map((event) => {
          const feed = feeds.find((item) => item.id === event.feedId);

          return (
            <article key={event.id} className={`border-b border-l-4 border-b-[#e0e0e0] p-4 last:border-b-0 ${severityClass[event.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-[#525252]">{event.detectedAt}</p>
                  <h3 className="mt-2 font-medium">{event.label}</h3>
                  <p className="mt-1 text-sm text-[#525252]">{feed?.name ?? "알 수 없음"}</p>
                </div>
                <span className="border border-[#c6c6c6] bg-[#f4f4f4] px-2 py-1 text-xs text-[#525252]">
                  {reviewLabel[event.reviewStatus]}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-[#525252]">
                {event.evidence.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-3 gap-px bg-[#e0e0e0] text-sm">
                <ReviewButton active={event.reviewStatus === "confirmed"} onClick={() => onReview(event.id, "confirmed")}>
                  확인
                </ReviewButton>
                <ReviewButton active={event.reviewStatus === "dismissed"} onClick={() => onReview(event.id, "dismissed")}>
                  오탐
                </ReviewButton>
                <ReviewButton active={event.reviewStatus === "needs_review"} onClick={() => onReview(event.id, "needs_review")}>
                  대기
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
      className={`${active ? "bg-[#0f62fe] text-white" : "bg-white text-[#525252] hover:bg-[#f4f4f4]"} px-3 py-2`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EmptyPanel() {
  return (
    <section className="flex min-h-[680px] items-center justify-center border border-[#e0e0e0] bg-white p-4 text-[#525252]">
      표시할 CCTV가 없습니다.
    </section>
  );
}

function PanelHeader({ title, description, count }: { title: string; description: string; count: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#e0e0e0] p-4">
      <div>
        <h2 className="text-lg font-medium text-[#161616]">{title}</h2>
        <p className="mt-1 text-sm text-[#525252]">{description}</p>
      </div>
      <span className="border border-[#c6c6c6] bg-[#f4f4f4] px-2 py-1 text-xs text-[#525252]">{count}</span>
    </div>
  );
}

function StatusPill({ status }: { status: FeedStatus }) {
  return <span className={`border px-2 py-1 text-xs ${statusClass[status]}`}>{statusLabel[status]}</span>;
}
