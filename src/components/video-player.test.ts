import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoPlayer } from "./video-player";
import { cctvFeeds } from "@/lib/cctv";

describe("실제 영상 연결 전 명시적 재생", () => {
  it("URL이 있어도 첫 렌더에는 영상 요소나 분석 박스를 만들지 않는다", () => {
    const html = renderToStaticMarkup(createElement(VideoPlayer, {
      feed: { ...cctvFeeds[0], streamUrl: "https://example.com/live.m3u8" },
    }));
    expect(html).toContain("영상 연결 시작");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("live.m3u8");
    expect(html).not.toContain("SceneGuides");
    expect(html).not.toContain("left-[18%]");
  });

  it("샘플 지점은 재생 버튼 대신 연결 대기로 표시한다", () => {
    const html = renderToStaticMarkup(createElement(VideoPlayer, { feed: cctvFeeds[0] }));
    expect(html).toContain("영상 연결 대기");
    expect(html).not.toContain("영상 연결 시작");
  });
});
