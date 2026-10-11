import { VideoPlayer } from "@/components/video-player";
import {
  cctvFeeds,
  detectionEvents,
  getControlRoomSummary,
  getTopPriorityEvents,
  type CctvFeed,
  type DetectionEvent,
  type EventSeverity,
  type FeedStatus,
} from "@/lib/cctv";

const summary = getControlRoomSummary(cctvFeeds, detectionEvents);
const priorityEvents = getTopPriorityEvents(detectionEvents, 4);
const selectedFeed = cctvFeeds[0];

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

export default function Home() {
  return (
    <main className="min-h-screen bg-[#071017] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-6 px-5 py-5 lg:px-8">
        <Header />
        <SummaryCards />

        <section className="grid flex-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
          <FeedList feeds={cctvFeeds} selectedFeedId={selectedFeed.id} />
          <VideoWorkspace feed={selectedFeed} events={priorityEvents} />
          <EventPanel events={priorityEvents} />
        </section>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-cyan-300">Highway CCTV AI · MVP 관제 프로토타입</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
            AI가 의심 이벤트를 정리하고, 운영자가 빠르게 확인합니다.
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[520px]">
          <Badge label="저장" value="비활성" tone="safe" />
          <Badge label="출처" value="표시" tone="safe" />
          <Badge label="판정" value="후보" tone="warn" />
          <Badge label="연결" value="샘플" tone="info" />
        </div>
      </div>
    </header>
  );
}

function SummaryCards() {
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

function FeedList({ feeds, selectedFeedId }: { feeds: CctvFeed[]; selectedFeedId: string }) {
  return (
    <aside className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">CCTV 목록</h2>
          <p className="text-sm text-slate-400">소수 샘플로 연결 안정성부터 검증</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{feeds.length}개</span>
      </div>

      <div className="space-y-3">
        {feeds.map((feed) => (
          <article
            key={feed.id}
            className={`rounded-2xl border p-4 transition ${
              feed.id === selectedFeedId
                ? "border-cyan-300/60 bg-cyan-300/10"
                : "border-white/10 bg-white/[0.03]"
            }`}
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
          </article>
        ))}
      </div>
    </aside>
  );
}

function VideoWorkspace({ feed, events }: { feed: CctvFeed; events: DetectionEvent[] }) {
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
        {events.slice(0, 3).map((event) => (
          <article key={event.id} className={`rounded-2xl border p-4 ${severityClass[event.severity]}`}>
            <p className="text-xs opacity-75">{event.detectedAt}</p>
            <h3 className="mt-1 font-semibold">{event.label}</h3>
            <p className="mt-2 text-sm opacity-80">신뢰도 {(event.confidence * 100).toFixed(0)}%</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function EventPanel({ events }: { events: DetectionEvent[] }) {
  return (
    <aside className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">AI 이벤트 후보</h2>
        <p className="text-sm text-slate-400">확정 판정 전, 근거와 함께 운영자 검토</p>
      </div>

      <div className="space-y-3">
        {events.map((event) => {
          const feed = cctvFeeds.find((item) => item.id === event.feedId);

          return (
            <article key={event.id} className={`rounded-2xl border p-4 ${severityClass[event.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs opacity-70">{event.detectedAt}</p>
                  <h3 className="mt-1 font-semibold">{event.label}</h3>
                  <p className="mt-1 text-sm opacity-80">{feed?.name ?? "알 수 없음"}</p>
                </div>
                <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{(event.confidence * 100).toFixed(0)}%</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm opacity-85">
                {event.evidence.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <button className="rounded-full bg-white/15 px-3 py-2">확인</button>
                <button className="rounded-full bg-white/10 px-3 py-2">오탐</button>
                <button className="rounded-full bg-white/10 px-3 py-2">보류</button>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
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
