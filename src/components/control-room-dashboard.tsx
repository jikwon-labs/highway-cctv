"use client";

import { useMemo, useState } from "react";

import { VideoPlayer } from "@/components/video-player";
import { getFeedEventMarker, layoutMapMarkers, reconcileWorkspaceSelection, selectEventWorkspace, selectFeedWorkspace, type WorkspaceSelection } from "@/lib/workspace-selection";
import type { CctvSnapshot, CctvSourceRuntimeStatus } from "@/lib/cctv-api";
import { getCctvSourceLabel, mergeCctvSnapshot } from "@/lib/cctv-api";
import {
  getControlRoomSummary,
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
import {
  buildEventQueueSummary,
  buildEventTimeline,
  filterEventQueue,
  searchEventQueue,
  sortEventQueue,
  type EventQueueFilter,
  type EventQueueSort,
  type EventTimelineItem,
} from "@/lib/event-workflow";
import {
  applyReviewHistoryToEvents,
  createReviewHistoryEntry,
  exportReviewHistoryAsCsv,
  exportReviewHistoryAsJson,
  getReviewReasonOptions,
  getSelectedReviewReason,
  parseReviewHistory,
  reviewHistoryStorageKey,
  serializeReviewHistory,
  type ReviewHistoryEntry,
  type ReviewReasonSelection,
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

const eventQueueSortOptions: Array<{ label: string; value: EventQueueSort }> = [
  { label: "긴급도순", value: "priority" },
  { label: "신뢰도순", value: "confidence" },
  { label: "최신순", value: "latest" },
  { label: "지점순", value: "feed" },
];

const reviewTargetStatusOptions: Array<{ label: string; value: ReviewStatus }> = [
  { label: "확인", value: "confirmed" },
  { label: "오탐", value: "dismissed" },
  { label: "대기", value: "needs_review" },
];

const defaultRuntimeStatus: CctvSourceRuntimeStatus = {
  requestedMode: "mock",
  effectiveMode: "mock",
  label: "mock 데이터",
  hasApiKey: false,
  isRealSource: false,
  notice: "샘플 데이터로 화면과 운영 흐름을 검증 중입니다.",
};

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
  const [workspaceSelection, setWorkspaceSelection] = useState<WorkspaceSelection>(() =>
    selectFeedWorkspace(initialFeeds, events, initialFeeds[0]?.id ?? "") ?? { feedId: "", eventId: "" },
  );
  const { feedId: selectedFeedId, eventId: selectedEventId } = workspaceSelection;
  const [statusFilter, setStatusFilter] = useState<FeedStatusFilter>("all");
  const [eventQueueFilter, setEventQueueFilter] = useState<EventQueueFilter>("needs_review");
  const [eventQueueSort, setEventQueueSort] = useState<EventQueueSort>("priority");
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [apiStatus, setApiStatus] = useState("mock 데이터 사용 중");
  const [sourceRuntimeStatus, setSourceRuntimeStatus] = useState<CctvSourceRuntimeStatus>(defaultRuntimeStatus);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reviewTargetStatusByEventId, setReviewTargetStatusByEventId] = useState<Record<string, ReviewStatus>>({});
  const [reviewReasonByEventId, setReviewReasonByEventId] = useState<Record<string, ReviewReasonSelection>>({});

  const visibleFeeds = useMemo(
    () => filterFeedsByStatus(feeds, statusFilter),
    [feeds, statusFilter],
  );
  const selectedFeed =
    feeds.find((feed) => feed.id === selectedFeedId) ?? visibleFeeds[0] ?? feeds[0];
  const selectedFeedEvents = selectedFeed ? getEventsForFeed(events, selectedFeed.id) : [];
  const eventQueueSummary = useMemo(() => buildEventQueueSummary(events), [events]);
  const visibleQueueEvents = useMemo(
    () => sortEventQueue(searchEventQueue(filterEventQueue(events, eventQueueFilter), feeds, eventSearchQuery), feeds, eventQueueSort),
    [events, eventQueueFilter, eventQueueSort, eventSearchQuery, feeds],
  );
  const priorityEvents = visibleQueueEvents.slice(0, 4);
  // Queue filtering must never replace the selected location with another event.
  const selectedEvent = events.find((event) => event.id === selectedEventId && event.feedId === selectedFeed?.id);
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
    setWorkspaceSelection((current) =>
      selectFeedWorkspace(feeds, events, getNextSelectedFeedId(nextVisibleFeeds, current.feedId)) ?? current,
    );
  }

  function handleSelectFeed(feedId: string) {
    const selection = selectFeedWorkspace(feeds, events, feedId);
    if (!selection) return;
    setWorkspaceSelection(selection);
    if (!visibleFeeds.some((feed) => feed.id === feedId)) setStatusFilter("all");
  }

  function handleSelectEvent(eventId: string) {
    const selection = selectEventWorkspace(feeds, events, eventId);
    if (!selection) return;
    setWorkspaceSelection(selection);
    if (!visibleFeeds.some((feed) => feed.id === selection.feedId)) setStatusFilter("all");
  }

  function handleEventQueueFilterChange(nextFilter: EventQueueFilter) {
    setEventQueueFilter(nextFilter);
  }

  function handleEventQueueSortChange(nextSort: EventQueueSort) {
    setEventQueueSort(nextSort);
  }

  function handleEventSearchChange(nextQuery: string) {
    setEventSearchQuery(nextQuery);
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
        reasonNote: getSelectedReviewReason(reviewReasonByEventId[event.id], reviewStatus),
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
      setFeeds(mergedSnapshot.feeds);
      setEvents(mergedSnapshot.events);
      setWorkspaceSelection((current) =>
        reconcileWorkspaceSelection(mergedSnapshot.feeds, mergedSnapshot.events, current),
      );
      setSourceRuntimeStatus(snapshot.meta.runtimeStatus ?? defaultRuntimeStatus);
      setApiStatus(`${getCctvSourceLabel(snapshot.meta.source)} · ${snapshot.meta.generatedAt.slice(11, 19)} 갱신`);
    } catch (error) {
      setApiStatus(error instanceof Error ? `갱신 실패 · ${error.message}` : "갱신 실패");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f4f4] text-[#161616]">
      <Header
        apiStatus={apiStatus}
        isRefreshing={isRefreshing}
        sourceRuntimeStatus={sourceRuntimeStatus}
        onRefresh={handleRefresh}
      />

      <div className="mx-auto flex min-h-screen w-full max-w-[1584px] flex-col gap-4 px-4 py-4 md:px-8">
        <SummaryCards summary={summary} />

        <section className="grid flex-1 gap-4 xl:grid-cols-[336px_minmax(0,1fr)_392px]">
          <FeedList
            feeds={visibleFeeds}
            selectedFeedId={selectedFeed?.id ?? ""}
            statusFilter={statusFilter}
            onSelectFeed={handleSelectFeed}
            onFilterChange={handleFilterChange}
          />
          {selectedFeed ? (
            <VideoWorkspace
              feed={selectedFeed}
              feeds={feeds}
              allEvents={events}
              onSelectEvent={handleSelectEvent}
              events={selectedFeedEvents}
              selectedEvent={selectedEvent}
              eventTimeline={selectedEventTimeline}
              onSelectFeed={handleSelectFeed}
            />
          ) : (
            <EmptyPanel />
          )}
          <RightRail
            sourceStatusCards={sourceStatusCards}
            sourceSummary={sourceSummary}
            events={priorityEvents}
            eventQueueFilter={eventQueueFilter}
            eventQueueSort={eventQueueSort}
            eventQueueSummary={eventQueueSummary}
            eventSearchQuery={eventSearchQuery}
            onEventQueueFilterChange={handleEventQueueFilterChange}
            onEventQueueSortChange={handleEventQueueSortChange}
            onEventSearchChange={handleEventSearchChange}
            selectedEventId={selectedEvent?.id ?? ""}
            onSelectEvent={handleSelectEvent}
            feeds={feeds}
            reviewHistory={reviewHistory}
            reviewTargetStatusByEventId={reviewTargetStatusByEventId}
            reviewReasonByEventId={reviewReasonByEventId}
            onTargetStatusChange={(eventId, status) =>
              setReviewTargetStatusByEventId((currentStatuses) => ({
                ...currentStatuses,
                [eventId]: status,
              }))
            }
            onReasonChange={(eventId, reason) =>
              setReviewReasonByEventId((currentReasons) => ({
                ...currentReasons,
                [eventId]: {
                  ...currentReasons[eventId],
                  [reviewTargetStatusByEventId[eventId] ?? "confirmed"]: reason,
                },
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
  sourceRuntimeStatus,
  onRefresh,
}: {
  apiStatus: string;
  isRefreshing: boolean;
  sourceRuntimeStatus: CctvSourceRuntimeStatus;
  onRefresh: () => void;
}) {
  const sourceModeLabel = sourceRuntimeStatus.isRealSource ? "실제 소스" : "안전 모드";

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

        <div className="flex max-w-xl flex-col gap-3 text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <span className="border border-[#525252] px-3 py-2 text-[#e0e0e0]">{apiStatus}</span>
            <span
              className={`border px-3 py-2 ${
                sourceRuntimeStatus.isRealSource
                  ? "border-[#24a148] bg-[#16391f] text-[#defbe6]"
                  : "border-[#6f6f6f] bg-[#262626] text-[#e0e0e0]"
              }`}
            >
              {sourceModeLabel} · {sourceRuntimeStatus.label}
            </span>
          </div>
          <p className="text-left text-xs leading-5 text-[#c6c6c6] sm:text-right">{sourceRuntimeStatus.notice}</p>
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
  feed, feeds, events, allEvents, selectedEvent, eventTimeline, onSelectFeed, onSelectEvent,
}: {
  feed: CctvFeed;
  feeds: CctvFeed[];
  events: DetectionEvent[];
  allEvents: DetectionEvent[];
  selectedEvent?: DetectionEvent;
  eventTimeline: EventTimelineItem[];
  onSelectFeed: (feedId: string) => void;
  onSelectEvent: (eventId: string) => void;
}) {
  const visibleEvents = events;

  return (
    <section aria-label="선택 CCTV 작업 영역" data-feed-id={feed.id} className="flex min-h-[680px] min-w-0 flex-col border border-[#e0e0e0] bg-white">
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
        <CctvMap feeds={feeds} events={allEvents} selectedFeed={feed} onSelectFeed={onSelectFeed} />
        <VideoPlayer feed={feed} />
        <p className="text-sm text-[#525252]" aria-live="polite">
          {feed.name} 영상 · {selectedEvent ? `선택 후보: ${selectedEvent.label}` : "선택된 후보 없음"}
          <span className="mt-1 block text-xs">현재 영상은 감지 시점의 녹화 영상이 아닙니다. 후보 시각과 영상 상태를 함께 확인하세요.</span>
        </p>
        <EventDetailPanel event={selectedEvent} timeline={eventTimeline} />

        <div className="grid gap-px border border-[#e0e0e0] bg-[#e0e0e0] md:grid-cols-3">
          {visibleEvents.length > 0 ? (
            visibleEvents.slice(0, 3).map((event) => (
              <button key={event.id} type="button" aria-pressed={event.id === selectedEvent?.id}
                onClick={() => onSelectEvent(event.id)} className={`bg-white p-4 text-left hover:bg-[#edf5ff] focus-visible:outline-2 focus-visible:outline-[#0f62fe] ${event.id === selectedEvent?.id ? "ring-2 ring-inset ring-[#0f62fe]" : ""}`}>
                <div className={`mb-3 h-1 w-8 ${severityBarClass[event.severity]}`} />
                <p className="font-mono text-xs text-[#525252]">{event.detectedAt}</p>
                <h3 className="mt-2 font-medium text-[#161616]">{event.label}</h3>
                <p className="mt-2 text-sm text-[#525252]">신뢰도 {(event.confidence * 100).toFixed(0)}% · {reviewLabel[event.reviewStatus]}</p>
                <span className="mt-2 block text-xs text-[#0f62fe]">이 후보 상세 보기</span>
              </button>
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
      <section aria-label="이벤트 상세" className="border border-[#e0e0e0] bg-white p-4 text-sm text-[#525252]">
        이 CCTV에 선택된 감지 후보가 없습니다.
      </section>
    );
  }

  return (
    <section aria-label="이벤트 상세" data-event-id={event.id} className="border border-[#e0e0e0] bg-white">
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
  feeds, events, selectedFeed, onSelectFeed,
}: {
  feeds: CctvFeed[];
  events: DetectionEvent[];
  selectedFeed: CctvFeed;
  onSelectFeed: (feedId: string) => void;
}) {
  const markerPoints = layoutMapMarkers(feeds);
  return (
    <section aria-label="CCTV 지도" className="border border-[#e0e0e0] bg-[#f4f4f4]">
      <div className="border-b border-[#e0e0e0] bg-white p-4">
        <p className="font-mono text-xs text-[#525252]">지도 화면 · 좌표 기반 개략도 (겹침 방지 배치)</p>
        <h3 className="mt-1 text-xl font-normal text-[#161616]">CCTV 위치 선택</h3>
        <p className="mt-2 text-sm text-[#525252]">지점을 선택하면 영상과 연결 후보를 함께 확인합니다.</p>
        <p className="mt-2 text-xs leading-5 text-[#525252]">점: 영상 연결 상태 · 숫자: 후보 건수(오탐 제외) · 빨강: 긴급 · 노랑: 주의 · 파랑 테두리: 선택</p>
      </div>

      <div className="relative h-[360px] overflow-hidden bg-[#eef2f3]">
        <MapBackground />
        {/* An inset keeps edge labels and touch targets inside narrow viewports. */}
        <div className="absolute inset-x-12 inset-y-4">
          {feeds.map((feed) => {
            const point = markerPoints[feed.id];
            const selected = feed.id === selectedFeed.id;
            const marker = getFeedEventMarker(events, feed.id);
            const markerClass = marker.severity === "critical"
              ? "border-[#da1e28] bg-[#fff1f1]" : marker.count > 0
                ? "border-[#b28600] bg-[#fcf4d6]" : "border-[#8d8d8d] bg-white";
            return (
              <button
                key={feed.id}
                aria-label={`지도에서 ${feed.name} 선택`}
                aria-pressed={selected}
                title={`${feed.name} · ${statusLabel[feed.status]} · 후보 ${marker.count}건 · 검토 대기 ${marker.needsReview}건`}
                data-event-count={marker.count}
                data-severity={marker.severity ?? "none"}
                className={`absolute flex min-h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 border px-2 py-1 text-xs shadow-sm transition hover:bg-[#edf5ff] focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-[#0f62fe] ${markerClass} ${selected ? "z-20 ring-2 ring-[#0f62fe]" : "z-10"}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                type="button"
                onClick={() => onSelectFeed(feed.id)}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full border border-white ${statusDotClass[feed.status]}`} />
                <span className="max-w-16 truncate text-[#161616]">{feed.name}</span>
                {marker.count > 0 ? (
                  <span className={`px-1.5 py-0.5 font-mono ${marker.severity === "critical" ? "bg-[#da1e28] text-white" : "bg-[#f1c21b] text-[#161616]"}`}>
                    {marker.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-[#c6c6c6] bg-[#c6c6c6] md:grid-cols-4">
        <MapInfo label="선택" value={selectedFeed.name} />
        <MapInfo label="노선" value={selectedFeed.route} />
        <MapInfo label="방향" value={selectedFeed.direction} />
        <MapInfo label="후보 / 검토 대기" value={`${getFeedEventMarker(events, selectedFeed.id).count} / ${getFeedEventMarker(events, selectedFeed.id).needsReview}건`} />
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
  eventQueueSort,
  eventQueueSummary,
  eventSearchQuery,
  onEventQueueFilterChange,
  onEventQueueSortChange,
  onEventSearchChange,
  selectedEventId,
  onSelectEvent,
  feeds,
  reviewHistory,
  reviewTargetStatusByEventId,
  reviewReasonByEventId,
  onTargetStatusChange,
  onReasonChange,
  onReview,
}: {
  sourceStatusCards: SourceStatusCard[];
  sourceSummary: ReturnType<typeof getSourceReadinessSummary>;
  events: DetectionEvent[];
  eventQueueFilter: EventQueueFilter;
  eventQueueSort: EventQueueSort;
  eventQueueSummary: Record<EventQueueFilter, number>;
  eventSearchQuery: string;
  onEventQueueFilterChange: (filter: EventQueueFilter) => void;
  onEventQueueSortChange: (sort: EventQueueSort) => void;
  onEventSearchChange: (query: string) => void;
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  feeds: CctvFeed[];
  reviewHistory: ReviewHistoryEntry[];
  reviewTargetStatusByEventId: Record<string, ReviewStatus>;
  reviewReasonByEventId: Record<string, ReviewReasonSelection>;
  onTargetStatusChange: (eventId: string, status: ReviewStatus) => void;
  onReasonChange: (eventId: string, reason: string) => void;
  onReview: (eventId: string, reviewStatus: ReviewStatus) => void;
}) {
  return (
    <aside className="flex flex-col gap-4">
      <SourceStatusPanel cards={sourceStatusCards} summary={sourceSummary} />
      <EventPanel
        events={events}
        eventQueueFilter={eventQueueFilter}
        eventQueueSort={eventQueueSort}
        eventQueueSummary={eventQueueSummary}
        eventSearchQuery={eventSearchQuery}
        onEventQueueFilterChange={onEventQueueFilterChange}
        onEventQueueSortChange={onEventQueueSortChange}
        onEventSearchChange={onEventSearchChange}
        selectedEventId={selectedEventId}
        onSelectEvent={onSelectEvent}
        feeds={feeds}
        reviewTargetStatusByEventId={reviewTargetStatusByEventId}
        reviewReasonByEventId={reviewReasonByEventId}
        onTargetStatusChange={onTargetStatusChange}
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
  function handleDownload(format: "json" | "csv") {
    const content = format === "json" ? exportReviewHistoryAsJson(history) : exportReviewHistoryAsCsv(history);
    const mimeType = format === "json" ? "application/json" : "text/csv";
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `review-history.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="border border-[#e0e0e0] bg-white">
      <PanelHeader title="검토 이력" description="브라우저 저장소에 최근 처리 내역을 남깁니다." count={`${history.length}건`} />

      <div className="grid grid-cols-2 gap-px border-b border-[#e0e0e0] bg-[#e0e0e0] text-sm">
        <button
          className="bg-white px-3 py-2 text-left text-[#0f62fe] disabled:text-[#8d8d8d]"
          type="button"
          disabled={history.length === 0}
          onClick={() => handleDownload("json")}
        >
          JSON 다운로드
        </button>
        <button
          className="bg-white px-3 py-2 text-left text-[#0f62fe] disabled:text-[#8d8d8d]"
          type="button"
          disabled={history.length === 0}
          onClick={() => handleDownload("csv")}
        >
          CSV 다운로드
        </button>
      </div>

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
  eventQueueSort,
  eventQueueSummary,
  eventSearchQuery,
  onEventQueueFilterChange,
  onEventQueueSortChange,
  onEventSearchChange,
  selectedEventId,
  onSelectEvent,
  feeds,
  reviewTargetStatusByEventId,
  reviewReasonByEventId,
  onTargetStatusChange,
  onReasonChange,
  onReview,
}: {
  events: DetectionEvent[];
  eventQueueFilter: EventQueueFilter;
  eventQueueSort: EventQueueSort;
  eventQueueSummary: Record<EventQueueFilter, number>;
  eventSearchQuery: string;
  onEventQueueFilterChange: (filter: EventQueueFilter) => void;
  onEventQueueSortChange: (sort: EventQueueSort) => void;
  onEventSearchChange: (query: string) => void;
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  feeds: CctvFeed[];
  reviewTargetStatusByEventId: Record<string, ReviewStatus>;
  reviewReasonByEventId: Record<string, ReviewReasonSelection>;
  onTargetStatusChange: (eventId: string, status: ReviewStatus) => void;
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

      <div className="grid gap-px border-b border-[#e0e0e0] bg-[#e0e0e0] md:grid-cols-[1fr_160px]">
        <label className="block bg-white p-4 text-sm text-[#525252]">
          감지 후보 검색
          <input
            className="mt-2 w-full border border-[#c6c6c6] bg-white px-3 py-2 text-sm text-[#161616] placeholder:text-[#8d8d8d]"
            placeholder="지점, 이벤트, 근거 검색"
            type="search"
            value={eventSearchQuery}
            onChange={(event) => onEventSearchChange(event.target.value)}
          />
        </label>
        <label className="block bg-white p-4 text-sm text-[#525252]">
          정렬
          <select
            className="mt-2 w-full border border-[#c6c6c6] bg-white px-3 py-2 text-sm text-[#161616]"
            value={eventQueueSort}
            onChange={(event) => onEventQueueSortChange(event.target.value as EventQueueSort)}
          >
            {eventQueueSortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        {events.length === 0 ? (
          <div className="p-4 text-sm text-[#525252]">현재 필터에 해당하는 감지 후보가 없습니다.</div>
        ) : null}
        {events.map((event) => {
          const feed = feeds.find((item) => item.id === event.feedId);
          const targetStatus = reviewTargetStatusByEventId[event.id] ?? "confirmed";
          const selectedReason = getSelectedReviewReason(reviewReasonByEventId[event.id], targetStatus);
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
              <div className="mt-4 grid gap-3 border border-[#e0e0e0] bg-[#f4f4f4] p-3">
                <label className="block text-sm text-[#525252]">
                  처리 상태
                  <select
                    className="mt-2 w-full border border-[#c6c6c6] bg-white px-3 py-2 text-sm text-[#161616]"
                    value={targetStatus}
                    onChange={(changeEvent) => onTargetStatusChange(event.id, changeEvent.target.value as ReviewStatus)}
                  >
                    {reviewTargetStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[#525252]">
                  {reviewLabel[targetStatus]} 사유
                  <select
                    className="mt-2 w-full border border-[#c6c6c6] bg-white px-3 py-2 text-sm text-[#161616]"
                    value={selectedReason}
                    onChange={(changeEvent) => onReasonChange(event.id, changeEvent.target.value)}
                  >
                    {getReviewReasonOptions(targetStatus).map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="bg-[#0f62fe] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0043ce] disabled:cursor-not-allowed disabled:bg-[#8d8d8d]"
                  type="button"
                  disabled={event.reviewStatus === targetStatus}
                  onClick={() => onReview(event.id, targetStatus)}
                >
                  선택 상태로 처리
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
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
