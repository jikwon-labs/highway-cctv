import type { CctvFeed } from "./cctv";

export type PlaybackStrategy = "hls" | "native-video" | "placeholder";

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
