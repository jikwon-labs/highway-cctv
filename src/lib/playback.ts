import type { CctvFeed } from "./cctv";

export type PlaybackStrategy = "hls" | "native-video" | "placeholder";

export function getHlsEngine(mseSupported: boolean, nativeSupport: string): "hls-js" | "native" | "unsupported" {
  // Chromium can report native HLS 'maybe' yet fail to demux the live stream.
  if (mseSupported) return "hls-js";
  return nativeSupport ? "native" : "unsupported";
}

export function getPlaybackErrorMessage({ mediaCode, hlsType, details, httpStatus }: {
  mediaCode?: number; hlsType?: string; details?: string; httpStatus?: number;
}): string {
  if (httpStatus && [401, 403, 404, 410].includes(httpStatus)) return `영상 서버 접근 실패 (HTTP ${httpStatus}) · 데이터 갱신으로 주소를 확인하세요`;
  if (mediaCode === 4) return "영상 형식을 해석할 수 없습니다 · 다른 지점이나 브라우저를 확인하세요";
  if (mediaCode === 3 || hlsType === "mediaError") return "영상 디코딩 오류 · 다시 연결해 주세요";
  if (details === "fragLoadError" || details === "fragLoadTimeOut") return "영상 조각 요청 실패 · 네트워크 또는 영상 서버를 확인하세요";
  if (hlsType === "networkError" || mediaCode === 2) return "영상 네트워크 오류 · 연결 상태를 확인하고 다시 연결해 주세요";
  if (mediaCode === 1) return "영상 연결이 중단됐습니다";
  return "영상 연결 오류 · 다시 연결하거나 다른 지점을 선택하세요";
}

export function getPlaybackStrategy(
  streamUrl: CctvFeed["streamUrl"],
  streamType: CctvFeed["streamType"],
): PlaybackStrategy {
  if (!streamUrl || streamType === "SNAPSHOT") {
    return "placeholder";
  }

  const normalizedUrl = streamUrl.toLowerCase();

  if (streamType === "HLS" || streamType === "HTTPS HLS" || normalizedUrl.includes(".m3u8")) {
    return "hls";
  }

  return "native-video";
}
