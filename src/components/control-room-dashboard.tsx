"use client";

import { useMemo, useState } from "react";

import { VideoPlayer } from "@/components/video-player";
import type { CctvSnapshot } from "@/lib/cctv-api";
import { getCctvSourceLabel, mergeCctvSnapshot } from "@/lib/cctv-api";
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
  normalizeFeedToMap,
  updateEventReviewStatus,
  type FeedStatusFilter,
} from "@/lib/dashboard";
import {
  buildEventQueueSummary,
  buildEventTimeline,
  filterEventQueue,
  getNextSelectedEventId,
  type EventQueueFilter,
  type EventTimelineItem,
} from "@/lib/event-workflow";
import {
  applyReviewHistoryToEvents,
  createReviewHistoryEntry,
  getDefaultReviewReason,
  parseReviewHistory,
  reviewHistoryStorageKey,
  reviewReasonOptions,
  serializeReviewHistory,
  type ReviewHistoryEntry,
} from "@/lib/review-history";
import {
  buildSourceStatusCards,
  getSourceReadinessSummary,
  sourceProfiles,
  type SourceReadinessStatus,
  type SourceStatusCard,
} from "@/lib/source-status";

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

const statusDotClass: Record<FeedStatus, string> = {
  online: "bg-[#24a148]",
  degraded: "bg-[#f1c21b]",
  offline: "bg-[#da1e28]",
};

const sourceStatusLabel: Record<SourceReadinessStatus, string> = {
  ready: "사용 가능",
  needs_review: "확인 필요",
  blocked: "보류",
};

const sourceStatusClass: Record<SourceReadinessStatus, string> = {
  ready: "border-[#24a148] bg-[#defbe6] text-[#0e6027]",
  needs_review: "border-[#f1c21b] bg-[#fcf4d6] text-[#684e00]",
  blocked: "border-[#da1e28] bg-[#fff1f1] text-[#a2191f]",
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

const eventQueueFilterOptions: Array<{ label: string; value: EventQueueFilter }> = [
  { label: "전체", value: "all" },
  { label: "검토", value: "needs_review" },
  { label: "긴급", value: "critical" },
  { label: "확인", value: "confirmed" },
  { label: "오탐", value: "dismissed" },
];

function readStoredReviewHistory(): ReviewHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  return parseReviewHistory(window.localStorage.getItem(reviewHistoryStorageKey));
}

export function ControlRoomDashboard({
  initialFeeds,
  initialEvents,
}: {
  initialFeeds: CctvFeed[];
  initialEvents: DetectionEvent[];
}) {
  const [feeds, setFeeds] = useState(initialFeeds);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryEntry[]>(() => readStoredReviewHistory());
  const [events, setEvents] = useState(() => applyReviewHistoryToEvents(initialEvents, reviewHistory));
  const [selectedFeedId, setSelectedFeedId] = useState(initialFeeds[0]?.id ?? "");
  const [selectedEventId, setSelectedEventId] = useState(() => getNextSelectedEventId(initialEvents));
  const [statusFilter, setStatusFilter] = useState<FeedStatusFilter>("all");
  const [eventQueueFilter, setEventQueueFilter] = useState<EventQueueFilter>("needs_review");
  const [apiStatus, setApiStatus] = useState("mock 데이터 사용 중");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reviewReasonByEventId, setReviewReasonByEventId] = useState<Record<string, string>>({});

  const visibleFeeds = useMemo(
    () => filterFeedsByStatus(feeds, statusFilter),
    [feeds, statusFilter],
  );
  const selectedFeed =
    feeds.find((feed) => feed.id === selectedFeedId) ?? visibleFeeds[0] ?? feeds[0];
  const selectedFeedEvents = selectedFeed ? getEventsForFeed(events, selectedFeed.id) : [];
  const eventQueueSummary = useMemo(() => buildEventQueueSummary(events), [events]);
  const visibleQueueEvents = useMemo(
    () => filterEventQueue(events, eventQueueFilter),
    [events, eventQueueFilter],
  );
  const priorityEvents = getTopPriorityEvents(visibleQueueEvents, 4);
  const selectedEvent = priorityEvents.find((event) => event.id === selectedEventId) ?? priorityEvents[0];
  const selectedEventTimeline = selectedEvent ? buildEventTimeline(selectedEvent, reviewHistory) : [];
  const summary = getControlRoomSummary(feeds, events);
  const sourceStatusCards = useMemo(() => buildSourceStatusCards(feeds, sourceProfiles), [feeds]);
  const sourceSummary = useMemo(
    () => getSourceReadinessSummary(sourceStatusCards),
    [sourceStatusCards],
  );

  function handleFilterChange(nextFilter: FeedStatusFilter) {
    const nextVisibleFeeds = filterFeedsByStatus(feeds, nextFilter);

    setStatusFilter(nextFilter);
    setSelectedFeedId((currentFeedId) => getNextSelectedFeedId(nextVisibleFeeds, currentFeedId));
  }

  function handleEventQueueFilterChange(nextFilter: EventQueueFilter) {
    const nextEvents = filterEventQueue(events, nextFilter);

    setEventQueueFilter(nextFilter);
    setSelectedEventId((currentEventId) => getNextSelectedEventId(nextEvents, currentEventId));
  }

  function handleReview(eventId: string, reviewStatus: ReviewStatus) {
    const event = events.find((item) => item.id === eventId);
    const feed = event ? feeds.find((item) => item.id === event.feedId) : undefined;

    if (!event || !feed || event.reviewStatus === reviewStatus) {
      return;
    }

    const nextHistory = [
      createReviewHistoryEntry({
        event,
        feed,
        previousStatus: event.reviewStatus,
        nextStatus: reviewStatus,
        reasonNote: reviewReasonByEventId[event.id] ?? getDefaultReviewReason(reviewStatus),
        operator: "운영자",
        createdAt: new Date().toISOString(),
      }),
      ...reviewHistory,
    ].slice(0, 50);

    setReviewHistory(nextHistory);
    window.localStorage.setItem(reviewHistoryStorageKey, serializeReviewHistory(nextHistory));
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
      setSelectedEventId((currentEventId) => getNextSelectedEventId(mergedSnapshot.events, currentEventId));
      setApiStatus(`${getCctvSourceLabel(snapshot.meta.source)} · ${snapshot.meta.generatedAt.slice(11, 19)} 갱신`);
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
            <VideoWorkspace
              feed={selectedFeed}
              feeds={visibleFeeds.length > 0 ? visibleFeeds : feeds}
              events={selectedFeedEvents}
              selectedEvent={selectedEvent}
              eventTimeline={selectedEventTimeline}
              onSelectFeed={setSelectedFeedId}
            />
          ) : (
            <EmptyPanel />
          )}
          <RightRail
            sourceStatusCards={sourceStatusCards}
            sourceSummary={sourceSummary}
            events={priorityEvents}
            eventQueueFilter={eventQueueFilter}
            eventQueueSummary={eventQueueSummary}
            onEventQueueFilterChange={handleEventQueueFilterChange}
            selectedEventId={selectedEvent?.id ?? ""}
            onSelectEvent={setSelectedEventId}
            feeds={feeds}
            reviewHistory={reviewHistory}
            reviewReasonByEventId={reviewReasonByEventId}
            onReasonChange={(eventId, reason) =>
              setReviewReasonByEventId((currentReasons) => ({
                ...currentReasons,
                [eventId]: reason,
              }))
            }
            onReview={handleReview}
          />
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

function VideoWorkspace({
  feed,
  feeds,
  events,
  selectedEvent,
  eventTimeline,
  onSelectFeed,
}: {
  feed: CctvFeed;
  feeds: CctvFeed[];
  events: DetectionEvent[];
  selectedEvent?: DetectionEvent;
  eventTimeline: EventTimelineItem[];
  onSelectFeed: (feedId: string) => void;
}) {
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

      <div className="flex flex-1 flex-col gap-4 p-4">
        <CctvMap feeds={feeds} selectedFeed={feed} onSelectFeed={onSelectFeed} />
        <VideoPlayer feed={feed} />
        <EventDetailPanel event={selectedEvent} timeline={eventTimeline} />

        <div className="grid gap-px border border-[#e0e0e0] bg-[#e0e0e0] md:grid-cols-3">
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

function EventDetailPanel({
  event,
  timeline,
}: {
  event?: DetectionEvent;
  timeline: EventTimelineItem[];
}) {
  if (!event) {
    return (
      <section className="border border-[#e0e0e0] bg-white p-4 text-sm text-[#525252]">
        선택된 감지 후보가 없습니다.
      </section>
    );
  }

  return (
    <section className="border border-[#e0e0e0] bg-white">
      <div className="grid gap-px border-b border-[#e0e0e0] bg-[#e0e0e0] md:grid-cols-[1fr_180px_120px]">
        <div className="bg-white p-4">
          <p className="font-mono text-xs text-[#525252]">이벤트 상세</p>
          <h3 className="mt-1 text-xl font-normal text-[#161616]">{event.label}</h3>
          <p className="mt-2 text-sm text-[#525252]">{event.type} · {event.detectedAt}</p>
        </div>
        <DetailMetric label="신뢰도" value={`${(event.confidence * 100).toFixed(0)}%`} />
        <DetailMetric label="상태" value={reviewLabel[event.reviewStatus]} />
      </div>

      <div className="grid gap-px bg-[#e0e0e0] md:grid-cols-[1fr_1fr]">
        <div className="bg-white p-4">
          <h4 className="text-sm font-medium text-[#161616]">근거</h4>
          <ul className="mt-3 space-y-2 text-sm text-[#525252]">
            {event.evidence.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white p-4">
          <h4 className="text-sm font-medium text-[#161616]">타임라인</h4>
          <ol className="mt-3 space-y-3">
            {timeline.map((item) => (
              <li key={item.id} className="border-l-2 border-[#0f62fe] pl-3">
                <p className="font-mono text-xs text-[#6f6f6f]">{item.timeLabel}</p>
                <p className="mt-1 text-sm font-medium text-[#161616]">{item.title}</p>
                <p className="mt-1 text-sm text-[#525252]">{item.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <p className="font-mono text-xs text-[#525252]">{label}</p>
      <p className="mt-2 text-lg text-[#161616]">{value}</p>
    </div>
  );
}

function CctvMap({
  feeds,
  selectedFeed,
  onSelectFeed,
}: {
  feeds: CctvFeed[];
  selectedFeed: CctvFeed;
  onSelectFeed: (feedId: string) => void;
}) {
  return (
    <section className="border border-[#e0e0e0] bg-[#f4f4f4]">
      <div className="flex flex-col gap-1 border-b border-[#e0e0e0] bg-white p-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs text-[#525252]">지도 화면</p>
          <h3 className="mt-1 text-xl font-normal text-[#161616]">CCTV 위치 선택</h3>
        </div>
        <p className="text-sm text-[#525252]">지도 지점을 클릭하면 해당 CCTV 화면으로 이동합니다.</p>
      </div>

      <div className="relative h-[360px] overflow-hidden bg-[#eef2f3]">
        <MapBackground />
        {feeds.map((feed) => {
          const point = normalizeFeedToMap(feeds, feed);
          const selected = feed.id === selectedFeed.id;

          return (
            <button
              key={feed.id}
              aria-label={`지도에서 ${feed.name} 선택`}
              className={`group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 border bg-white px-2 py-1 text-xs shadow-sm transition hover:border-[#0f62fe] hover:bg-[#edf5ff] ${
                selected ? "border-[#0f62fe] ring-2 ring-[#0f62fe]/20" : "border-[#8d8d8d]"
              }`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              type="button"
              onClick={() => onSelectFeed(feed.id)}
            >
              <span className={`h-2.5 w-2.5 rounded-full border border-white ${statusDotClass[feed.status]}`} />
              <span className="max-w-20 truncate text-[#161616]">{feed.name}</span>
            </button>
          );
        })}

        <div className="absolute bottom-4 left-4 right-4 z-20 grid gap-px border border-[#c6c6c6] bg-[#c6c6c6] md:grid-cols-4">
          <MapInfo label="선택" value={selectedFeed.name} />
          <MapInfo label="노선" value={selectedFeed.route} />
          <MapInfo label="방향" value={selectedFeed.direction} />
          <MapInfo
            label="좌표"
            value={`${selectedFeed.coordinates.lat.toFixed(3)}, ${selectedFeed.coordinates.lng.toFixed(3)}`}
          />
        </div>
      </div>
    </section>
  );
}

function MapBackground() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      role="img"
      aria-label="수도권 고속도로 개략 지도"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <rect width="100" height="100" fill="#eef2f3" />
      <path d="M4 66 C 25 58, 43 54, 96 60" fill="none" stroke="#c6c6c6" strokeWidth="1.3" />
      <path d="M16 22 C 34 38, 44 48, 60 92" fill="none" stroke="#c6c6c6" strokeWidth="1.2" />
      <path d="M8 84 C 26 74, 42 66, 78 70" fill="none" stroke="#d0d7da" strokeWidth="0.9" />
      <path d="M66 10 C 64 32, 70 50, 92 88" fill="none" stroke="#d0d7da" strokeWidth="0.9" />
      <path d="M52 18 C 40 34, 36 56, 44 92" fill="none" stroke="#ffffff" strokeWidth="0.35" strokeDasharray="2 2" />
      <path d="M8 46 H 96" fill="none" stroke="#ffffff" strokeWidth="0.35" strokeDasharray="2 2" />
      <text x="6" y="12" fill="#6f6f6f" fontSize="4" fontFamily="monospace">
        N
      </text>
      <text x="79" y="18" fill="#8d8d8d" fontSize="3.2" fontFamily="monospace">
        중부
      </text>
      <text x="12" y="79" fill="#8d8d8d" fontSize="3.2" fontFamily="monospace">
        서해안
      </text>
      <text x="40" y="51" fill="#8d8d8d" fontSize="3.2" fontFamily="monospace">
        경부
      </text>
    </svg>
  );
}

function MapInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-2">
      <p className="font-mono text-[11px] text-[#6f6f6f]">{label}</p>
      <p className="mt-1 truncate text-sm text-[#161616]">{value}</p>
    </div>
  );
}

function RightRail({
  sourceStatusCards,
  sourceSummary,
  events,
  eventQueueFilter,
  eventQueueSummary,
  onEventQueueFilterChange,
  selectedEventId,
  onSelectEvent,
  feeds,
  reviewHistory,
  reviewReasonByEventId,
  onReasonChange,
  onReview,
}: {
  sourceStatusCards: SourceStatusCard[];
  sourceSummary: ReturnType<typeof getSourceReadinessSummary>;
  events: DetectionEvent[];
  eventQueueFilter: EventQueueFilter;
  eventQueueSummary: Record<EventQueueFilter, number>;
  onEventQueueFilterChange: (filter: EventQueueFilter) => void;
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  feeds: CctvFeed[];
  reviewHistory: ReviewHistoryEntry[];
  reviewReasonByEventId: Record<string, string>;
  onReasonChange: (eventId: string, reason: string) => void;
  onReview: (eventId: string, reviewStatus: ReviewStatus) => void;
}) {
  return (
    <aside className="flex flex-col gap-4">
      <SourceStatusPanel cards={sourceStatusCards} summary={sourceSummary} />
      <EventPanel
        events={events}
        eventQueueFilter={eventQueueFilter}
        eventQueueSummary={eventQueueSummary}
        onEventQueueFilterChange={onEventQueueFilterChange}
        selectedEventId={selectedEventId}
        onSelectEvent={onSelectEvent}
        feeds={feeds}
        reviewReasonByEventId={reviewReasonByEventId}
        onReasonChange={onReasonChange}
        onReview={onReview}
      />
      <ReviewHistoryPanel history={reviewHistory} />
    </aside>
  );
}

function SourceStatusPanel({
  cards,
  summary,
}: {
  cards: SourceStatusCard[];
  summary: ReturnType<typeof getSourceReadinessSummary>;
}) {
  return (
    <section className="border border-[#e0e0e0] bg-white">
      <PanelHeader
        title="소스 상태"
        description="실서비스 연결 전 권한과 안정성을 확인합니다."
        count={`${summary.readySources}/${summary.totalSources}`}
      />

      <div className="grid grid-cols-3 gap-px border-b border-[#e0e0e0] bg-[#e0e0e0] text-sm">
        <SourceMetric label="확인 필요" value={summary.needsReviewSources} />
        <SourceMetric label="저장 제한" value={summary.storageRestrictedSources} />
        <SourceMetric label="보류" value={summary.blockedSources} />
      </div>

      <div>
        {cards.map((card) => (
          <article key={card.id} className="border-b border-[#e0e0e0] p-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-[#161616]">{card.name}</h3>
                <p className="mt-1 text-sm text-[#525252]">
                  {card.feedCount}개 지점 · {card.streamTypes.join(", ") || "형식 없음"}
                </p>
              </div>
              <span className={`border px-2 py-1 text-xs ${sourceStatusClass[card.status]}`}>
                {sourceStatusLabel[card.status]}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-px bg-[#e0e0e0] text-xs">
              <SourceState label="정상" value={card.onlineFeeds} />
              <SourceState label="지연" value={card.degradedFeeds} />
              <SourceState label="끊김" value={card.offlineFeeds} />
            </dl>

            <div className="mt-3 space-y-1 text-sm text-[#525252]">
              <p>저장: {policyLabel(card.storagePolicy)} · 재배포: {policyLabel(card.redistributionPolicy)}</p>
              <p>{card.rateLimit}</p>
              <p className="text-[#161616]">다음: {card.nextAction}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-3">
      <p className="font-mono text-[11px] text-[#6f6f6f]">{label}</p>
      <p className="mt-1 text-xl text-[#161616]">{value}</p>
    </div>
  );
}

function SourceState({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#f4f4f4] px-2 py-2">
      <dt className="text-[#6f6f6f]">{label}</dt>
      <dd className="mt-1 text-[#161616]">{value}</dd>
    </div>
  );
}

function policyLabel(policy: SourceStatusCard["storagePolicy"]): string {
  if (policy === "allowed") {
    return "가능";
  }

  if (policy === "restricted") {
    return "제한";
  }

  return "확인 필요";
}

function ReviewHistoryPanel({ history }: { history: ReviewHistoryEntry[] }) {
  return (
    <section className="border border-[#e0e0e0] bg-white">
      <PanelHeader title="검토 이력" description="브라우저 저장소에 최근 처리 내역을 남깁니다." count={`${history.length}건`} />

      {history.length === 0 ? (
        <div className="p-4 text-sm text-[#525252]">아직 검토 이력이 없습니다.</div>
      ) : (
        <div>
          {history.slice(0, 5).map((entry) => (
            <article key={entry.id} className="border-b border-[#e0e0e0] p-4 last:border-b-0">
              <p className="font-mono text-xs text-[#6f6f6f]">{formatHistoryTime(entry.createdAt)}</p>
              <h3 className="mt-2 font-medium text-[#161616]">{entry.eventLabel}</h3>
              <p className="mt-1 text-sm text-[#525252]">{entry.feedName}</p>
              <p className="mt-2 text-sm text-[#161616]">
                {reviewLabel[entry.previousStatus]} → {reviewLabel[entry.nextStatus]}
              </p>
              {entry.reasonNote ? <p className="mt-1 text-sm text-[#525252]">사유: {entry.reasonNote}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function EventPanel({
  events,
  eventQueueFilter,
  eventQueueSummary,
  onEventQueueFilterChange,
  selectedEventId,
  onSelectEvent,
  feeds,
  reviewReasonByEventId,
  onReasonChange,
  onReview,
}: {
  events: DetectionEvent[];
  eventQueueFilter: EventQueueFilter;
  eventQueueSummary: Record<EventQueueFilter, number>;
  onEventQueueFilterChange: (filter: EventQueueFilter) => void;
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  feeds: CctvFeed[];
  reviewReasonByEventId: Record<string, string>;
  onReasonChange: (eventId: string, reason: string) => void;
  onReview: (eventId: string, reviewStatus: ReviewStatus) => void;
}) {
  return (
    <aside className="border border-[#e0e0e0] bg-white">
      <PanelHeader title="감지 후보" description="확정 전 확인이 필요한 항목입니다." count={`${events.length}건`} />

      <div className="grid grid-cols-5 border-b border-[#e0e0e0] text-xs">
        {eventQueueFilterOptions.map((option) => (
          <button
            key={option.value}
            className={`border-r border-[#e0e0e0] px-2 py-3 text-left last:border-r-0 ${
              eventQueueFilter === option.value ? "bg-[#edf5ff] text-[#0f62fe]" : "text-[#525252] hover:bg-[#f4f4f4]"
            }`}
            type="button"
            onClick={() => onEventQueueFilterChange(option.value)}
          >
            <span className="block">{option.label}</span>
            <span className="mt-1 block font-mono">{eventQueueSummary[option.value]}</span>
          </button>
        ))}
      </div>

      <div>
        {events.length === 0 ? (
          <div className="p-4 text-sm text-[#525252]">현재 필터에 해당하는 감지 후보가 없습니다.</div>
        ) : null}
        {events.map((event) => {
          const feed = feeds.find((item) => item.id === event.feedId);
          const selectedReason = reviewReasonByEventId[event.id] ?? getDefaultReviewReason("confirmed");
          const selected = event.id === selectedEventId;

          return (
            <article
              key={event.id}
              className={`border-b border-l-4 border-b-[#e0e0e0] p-4 last:border-b-0 ${severityClass[event.severity]} ${
                selected ? "ring-2 ring-inset ring-[#0f62fe]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-[#525252]">{event.detectedAt}</p>
                  <h3 className="mt-2 font-medium">{event.label}</h3>
                  <p className="mt-1 text-sm text-[#525252]">{feed?.name ?? "알 수 없음"}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="border border-[#c6c6c6] bg-[#f4f4f4] px-2 py-1 text-xs text-[#525252]">
                    {reviewLabel[event.reviewStatus]}
                  </span>
                  <button
                    className="text-xs text-[#0f62fe] underline-offset-2 hover:underline"
                    type="button"
                    onClick={() => onSelectEvent(event.id)}
                  >
                    상세 보기
                  </button>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-[#525252]">
                {event.evidence.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
              <label className="mt-4 block text-sm text-[#525252]">
                처리 사유
                <select
                  className="mt-2 w-full border border-[#c6c6c6] bg-white px-3 py-2 text-sm text-[#161616]"
                  value={selectedReason}
                  onChange={(changeEvent) => onReasonChange(event.id, changeEvent.target.value)}
                >
                  {Object.values(reviewReasonOptions).flat().map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
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
