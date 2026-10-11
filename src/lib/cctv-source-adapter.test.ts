import { describe, expect, it } from "vitest";

import { cctvFeeds, detectionEvents } from "./cctv";
import {
  createItsCctvSourceAdapter,
  createMockCctvSourceAdapter,
  getConfiguredCctvSourceAdapter,
} from "./cctv-source-adapter";

describe("CCTV source adapters", () => {
  it("mock adapter는 기존 샘플 피드와 감지 후보를 동일한 snapshot 형태로 반환한다", async () => {
    const adapter = createMockCctvSourceAdapter({
      feeds: cctvFeeds,
      events: detectionEvents,
      now: () => new Date("2026-10-11T10:40:00.000Z"),
    });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot.meta).toEqual({
      source: "mock",
      generatedAt: "2026-10-11T10:40:00.000Z",
      feedCount: 6,
      eventCount: 4,
    });
    expect(snapshot.feeds[0]).not.toBe(cctvFeeds[0]);
    expect(snapshot.events[0]).not.toBe(detectionEvents[0]);
  });

  it("ITS adapter는 API 응답을 앱 snapshot 형태로 변환하고 이벤트는 비워둔다", async () => {
    let requestedUrl: URL | undefined;
    const adapter = createItsCctvSourceAdapter({
      apiKey: "test-key",
      now: () => new Date("2026-10-11T10:41:00.000Z"),
      fetcher: async (url) => {
        requestedUrl = url;

        return {
          response: {
            data: [
              {
                cctvname: "[경부선] 서울요금소",
                cctvurl: "https://example.com/live.m3u8",
                cctvtype: "4",
                coordx: "127.1049",
                coordy: "37.3349",
                roadsectionid: "0010",
                filecreatetime: "20261011185000",
              },
            ],
          },
        };
      },
    });

    const snapshot = await adapter.getSnapshot();

    expect(requestedUrl?.searchParams.get("apiKey")).toBe("test-key");
    expect(snapshot.meta).toEqual({
      source: "its",
      generatedAt: "2026-10-11T10:41:00.000Z",
      feedCount: 1,
      eventCount: 0,
    });
    expect(snapshot.feeds[0]).toMatchObject({
      id: "its-0010-0",
      name: "[경부선] 서울요금소",
      streamType: "HTTPS HLS",
      source: "ITS 국가교통정보센터",
    });
    expect(snapshot.events).toEqual([]);
  });

  it("환경 설정으로 mock/ITS adapter를 선택하되 API 키가 없으면 mock으로 안전하게 폴백한다", () => {
    const mockAdapter = getConfiguredCctvSourceAdapter({ CCTV_SOURCE_MODE: "mock" });
    const fallbackAdapter = getConfiguredCctvSourceAdapter({ CCTV_SOURCE_MODE: "its" });
    const itsAdapter = getConfiguredCctvSourceAdapter({
      CCTV_SOURCE_MODE: "its",
      ITS_API_KEY: "test-key",
    });

    expect(mockAdapter.id).toBe("mock");
    expect(fallbackAdapter.id).toBe("mock");
    expect(itsAdapter.id).toBe("its");
  });
});
