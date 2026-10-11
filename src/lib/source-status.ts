import type { CctvFeed } from "./cctv";

export type SourceReadinessStatus = "ready" | "needs_review" | "blocked";

export type SourceProfile = {
  id: string;
  name: string;
  status: SourceReadinessStatus;
  allowedUse: string;
  attribution: string;
  storagePolicy: "allowed" | "restricted" | "unknown";
  redistributionPolicy: "allowed" | "restricted" | "unknown";
  rateLimit: string;
  nextAction: string;
};

export type SourceStatusCard = SourceProfile & {
  feedCount: number;
  onlineFeeds: number;
  degradedFeeds: number;
  offlineFeeds: number;
  streamTypes: CctvFeed["streamType"][];
};

export type SourceReadinessSummary = {
  totalSources: number;
  readySources: number;
  needsReviewSources: number;
  blockedSources: number;
  storageRestrictedSources: number;
};

export const sourceProfiles: SourceProfile[] = [
  {
    id: "its-national-traffic",
    name: "ITS 국가교통정보센터",
    status: "needs_review",
    allowedUse: "공개 교통정보 조회 범위 확인 필요",
    attribution: "출처표시 필요",
    storagePolicy: "restricted",
    redistributionPolicy: "restricted",
    rateLimit: "API 키 발급 후 호출 제한 확인",
    nextAction: "API 약관, 저장/재배포 가능 여부, 요청 한도를 먼저 확인",
  },
  {
    id: "sample-validation",
    name: "샘플/검증용",
    status: "ready",
    allowedUse: "내부 UI/플레이어 검증",
    attribution: "서비스 외부 노출 전 교체",
    storagePolicy: "allowed",
    redistributionPolicy: "restricted",
    rateLimit: "제한 없음",
    nextAction: "실제 CCTV 연결 전 회귀 테스트 데이터로 유지",
  },
];

export function buildSourceStatusCards(
  feeds: CctvFeed[],
  profiles: SourceProfile[],
): SourceStatusCard[] {
  return profiles.map((profile) => {
    const sourceFeeds = feeds.filter((feed) => feed.source === profile.name);

    return {
      ...profile,
      feedCount: sourceFeeds.length,
      onlineFeeds: sourceFeeds.filter((feed) => feed.status === "online").length,
      degradedFeeds: sourceFeeds.filter((feed) => feed.status === "degraded").length,
      offlineFeeds: sourceFeeds.filter((feed) => feed.status === "offline").length,
      streamTypes: getUniqueStreamTypes(sourceFeeds),
    };
  });
}

export function getSourceReadinessSummary(cards: SourceStatusCard[]): SourceReadinessSummary {
  return {
    totalSources: cards.length,
    readySources: cards.filter((card) => card.status === "ready").length,
    needsReviewSources: cards.filter((card) => card.status === "needs_review").length,
    blockedSources: cards.filter((card) => card.status === "blocked").length,
    storageRestrictedSources: cards.filter((card) => card.storagePolicy === "restricted").length,
  };
}

function getUniqueStreamTypes(feeds: CctvFeed[]): CctvFeed["streamType"][] {
  return [...new Set(feeds.map((feed) => feed.streamType))].sort();
}
