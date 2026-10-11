import { describe, expect, it } from "vitest";

import { getPlaybackStrategy } from "./playback";

describe("영상 재생 전략", () => {
  it("m3u8 URL은 HLS 전략을 사용한다", () => {
    expect(getPlaybackStrategy("https://example.com/live.m3u8", "HTTPS HLS")).toBe("hls");
  });

  it("mp4 URL은 native video 전략을 사용한다", () => {
    expect(getPlaybackStrategy("https://example.com/clip.mp4", "HTTPS MP4")).toBe("native-video");
  });

  it("URL이 없거나 정지 영상이면 placeholder 전략을 사용한다", () => {
    expect(getPlaybackStrategy(undefined, "HLS")).toBe("placeholder");
    expect(getPlaybackStrategy("https://example.com/image.jpg", "SNAPSHOT")).toBe("placeholder");
  });
});
