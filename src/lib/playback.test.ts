import { describe, expect, it } from "vitest";

import { getPlaybackStrategy, getHlsEngine, getPlaybackErrorMessage } from "./playback";

describe("영상 재생 전략", () => {
  it("native HLS가 maybe여도 MSE가 있으면 hls.js로 처리한다", () => {
    expect(getHlsEngine(true, "maybe")).toBe("hls-js");
    expect(getHlsEngine(true, "probably")).toBe("hls-js");
    expect(getHlsEngine(false, "probably")).toBe("native");
    expect(getHlsEngine(false, "")).toBe("unsupported");
  });
  it("미디어 해석 오류를 URL 만료로 단정하지 않는다", () => {
    expect(getPlaybackErrorMessage({ mediaCode: 4 })).toContain("형식");
    expect(getPlaybackErrorMessage({ mediaCode: 4 })).not.toContain("만료");
    expect(getPlaybackErrorMessage({ mediaCode: 3 })).toContain("디코딩");
    expect(getPlaybackErrorMessage({ httpStatus: 403 })).toContain("HTTP 403");
    expect(getPlaybackErrorMessage({ hlsType: "networkError", details: "fragLoadError" })).toContain("영상 조각");
    expect(getPlaybackErrorMessage({ details: "https://fixture.invalid/sensitive-token" })).not.toContain("sensitive-token");
  });
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
