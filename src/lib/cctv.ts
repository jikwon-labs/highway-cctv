export type FeedStatus = "online" | "degraded" | "offline" | "unverified";

export type EventSeverity = "critical" | "warning" | "info";

export type ReviewStatus = "needs_review" | "confirmed" | "dismissed";

export type CctvFeed = {
  id: string;
  name: string;
  route: string;
  direction: string;
  location: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  status: FeedStatus;
  streamType: "HLS" | "HTTPS HLS" | "MP4" | "HTTPS MP4" | "SNAPSHOT";
  streamUrl?: string;
  latencySeconds: number;
  source: string;
  licenseNote: string;
  lastCheckedAt: string;
};

export type DetectionEvent = {
  id: string;
  feedId: string;
  type: "stopped_vehicle" | "wrong_way" | "congestion" | "weather" | "stream_loss";
  label: string;
  severity: EventSeverity;
  confidence: number;
  reviewStatus: ReviewStatus;
  detectedAt: string;
  evidence: string[];
};

export type ControlRoomSummary = {
  totalFeeds: number;
  onlineFeeds: number;
  degradedFeeds: number;
  offlineFeeds: number;
  activeEvents: number;
  criticalEvents: number;
  needsReview: number;
};

export const cctvFeeds: CctvFeed[] = [
  {
    id: "feed-gyeongbu-seoul-tg",
    name: "서울요금소",
    route: "경부고속도로",
    direction: "부산방향",
    location: "서울 TG 인근",
    coordinates: { lat: 37.3349, lng: 127.1049 },
    status: "online",
    streamType: "HTTPS HLS",
    latencySeconds: 8,
    source: "ITS 국가교통정보센터",
    licenseNote: "출처표시 필요 · 저장/재배포 금지 정책 확인 전",
    lastCheckedAt: "18:40",
  },
  {
    id: "feed-gyeongbu-pangyo",
    name: "판교 JC",
    route: "경부고속도로",
    direction: "서울방향",
    location: "판교 분기점",
    coordinates: { lat: 37.3944, lng: 127.101 },
    status: "online",
    streamType: "HLS",
    latencySeconds: 12,
    source: "ITS 국가교통정보센터",
    licenseNote: "프레임 추출/AI 분석 허용 여부 확인 필요",
    lastCheckedAt: "18:40",
  },
  {
    id: "feed-yeongdong-yongin",
    name: "용인 IC",
    route: "영동고속도로",
    direction: "강릉방향",
    location: "용인 IC 진입부",
    coordinates: { lat: 37.2357, lng: 127.2012 },
    status: "degraded",
    streamType: "HLS",
    latencySeconds: 43,
    source: "ITS 국가교통정보센터",
    licenseNote: "지연 증가 · 스트림 URL 수명 확인 필요",
    lastCheckedAt: "18:39",
  },
  {
    id: "feed-seohaean-maesong",
    name: "매송 IC",
    route: "서해안고속도로",
    direction: "목포방향",
    location: "매송 IC 인근",
    coordinates: { lat: 37.2527, lng: 126.8876 },
    status: "online",
    streamType: "HTTPS HLS",
    latencySeconds: 10,
    source: "ITS 국가교통정보센터",
    licenseNote: "출처표시 필요",
    lastCheckedAt: "18:40",
  },
  {
    id: "feed-jungbu-hanam",
    name: "하남 JC",
    route: "중부고속도로",
    direction: "통영방향",
    location: "하남 분기점",
    coordinates: { lat: 37.5457, lng: 127.2051 },
    status: "online",
    streamType: "SNAPSHOT",
    latencySeconds: 27,
    source: "ITS 국가교통정보센터",
    licenseNote: "정지영상 갱신 주기 확인 필요",
    lastCheckedAt: "18:38",
  },
  {
    id: "feed-tunnel-sample",
    name: "터널 샘플",
    route: "테스트 노선",
    direction: "양방향",
    location: "샘플 영상",
    coordinates: { lat: 37.421, lng: 127.122 },
    status: "offline",
    streamType: "HLS",
    latencySeconds: 0,
    source: "샘플/검증용",
    licenseNote: "실제 CCTV 연결 전 플레이스홀더",
    lastCheckedAt: "18:35",
  },
];

export const detectionEvents: DetectionEvent[] = [
  {
    id: "evt-stopped-vehicle-01",
    feedId: "feed-gyeongbu-seoul-tg",
    type: "stopped_vehicle",
    label: "정지 차량 후보",
    severity: "critical",
    confidence: 0.91,
    reviewStatus: "needs_review",
    detectedAt: "18:39:24",
    evidence: ["차로 ROI 내 움직임 75초 정체", "주변 흐름 대비 고정 객체 유지"],
  },
  {
    id: "evt-wrong-way-01",
    feedId: "feed-gyeongbu-pangyo",
    type: "wrong_way",
    label: "역주행 의심",
    severity: "critical",
    confidence: 0.78,
    reviewStatus: "needs_review",
    detectedAt: "18:38:02",
    evidence: ["주 진행 방향과 반대 벡터 추적", "연속 4프레임 이상 역방향 이동"],
  },
  {
    id: "evt-congestion-01",
    feedId: "feed-yeongdong-yongin",
    type: "congestion",
    label: "정체 후보",
    severity: "warning",
    confidence: 0.83,
    reviewStatus: "needs_review",
    detectedAt: "18:37:44",
    evidence: ["평균 움직임 밀도 급감", "스트림 지연 40초 초과"],
  },
  {
    id: "evt-weather-01",
    feedId: "feed-seohaean-maesong",
    type: "weather",
    label: "시야 저하 참고",
    severity: "warning",
    confidence: 0.62,
    reviewStatus: "confirmed",
    detectedAt: "18:35:18",
    evidence: ["프레임 대비 저하", "도로날씨 API 연계 예정"],
  },
];

const severityRank: Record<EventSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export function getControlRoomSummary(
  feeds: CctvFeed[],
  events: DetectionEvent[],
): ControlRoomSummary {
  return {
    totalFeeds: feeds.length,
    onlineFeeds: feeds.filter((feed) => feed.status === "online").length,
    degradedFeeds: feeds.filter((feed) => feed.status === "degraded").length,
    offlineFeeds: feeds.filter((feed) => feed.status === "offline").length,
    activeEvents: events.length,
    criticalEvents: events.filter((event) => event.severity === "critical").length,
    needsReview: events.filter((event) => event.reviewStatus === "needs_review").length,
  };
}

export function getTopPriorityEvents(
  events: DetectionEvent[],
  limit = 5,
): DetectionEvent[] {
  return [...events]
    .sort((a, b) => {
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];

      if (severityDelta !== 0) {
        return severityDelta;
      }

      return b.confidence - a.confidence;
    })
    .slice(0, limit);
}
