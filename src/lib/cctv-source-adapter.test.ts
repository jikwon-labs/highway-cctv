import { describe, expect, it, vi } from "vitest";

import { cctvFeeds, detectionEvents } from "./cctv";
import {
  createItsCctvSourceAdapter,
  createMockCctvSourceAdapter,
  getConfiguredCctvSourceAdapter,
  getCctvSourceRuntimeStatus,
  redactSourceErrorMessage,
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

  it("ITS adapter는 허용 범위를 넘는 좌표 박스를 실제 호출 전에 차단한다", async () => {
    let called = false;
    const adapter = createItsCctvSourceAdapter({
      apiKey: "test-key",
      params: {
        roadType: "all",
        cctvType: "4",
        minX: 120,
        maxX: 130,
        minY: 30,
        maxY: 40,
        responseType: "json",
      },
      fetcher: async () => {
        called = true;
        return { response: { data: [] } };
      },
    });

    await expect(adapter.getSnapshot()).rejects.toThrow("ITS request blocked");
    expect(called).toBe(false);
  });

  it("ITS adapter는 짧은 시간 안의 반복 갱신을 캐시해 실제 호출 횟수를 제한한다", async () => {
    let calls = 0;
    let currentTime = new Date("2026-10-11T10:42:00.000Z");
    const adapter = createItsCctvSourceAdapter({
      apiKey: "test-key",
      cacheTtlMs: 60_000,
      now: () => currentTime,
      fetcher: async () => {
        calls += 1;

        return {
          response: {
            data: [
              {
                cctvname: `CCTV ${calls}`,
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

    const first = await adapter.getSnapshot();
    currentTime = new Date("2026-10-11T10:42:30.000Z");
    const second = await adapter.getSnapshot();

    expect(calls).toBe(1);
    expect(second.meta.generatedAt).toBe(first.meta.generatedAt);
    expect(second.feeds[0].name).toBe("CCTV 1");
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

  it("환경 변수 기준 실제 호출 모드와 폴백 상태를 설명한다", () => {
    expect(getCctvSourceRuntimeStatus({ CCTV_SOURCE_MODE: "mock" })).toEqual({
      requestedMode: "mock",
      effectiveMode: "mock",
      label: "mock 데이터",
      hasApiKey: false,
      isRealSource: false,
      notice: "샘플 데이터로 화면과 운영 흐름을 검증 중입니다.",
    });
    expect(getCctvSourceRuntimeStatus({ CCTV_SOURCE_MODE: "its" })).toEqual({
      requestedMode: "its",
      effectiveMode: "mock",
      label: "mock 데이터",
      hasApiKey: false,
      isRealSource: false,
      notice: "ITS 모드가 요청됐지만 API 키가 없어 mock 데이터로 폴백했습니다.",
    });
    expect(getCctvSourceRuntimeStatus({ CCTV_SOURCE_MODE: "its", ITS_API_KEY: "test-key" })).toMatchObject({
      requestedMode: "its",
      effectiveMode: "its",
      label: "ITS 실제 소스",
      hasApiKey: true,
      isRealSource: true,
    });
  });

  it("실제 호출 기본 범위를 단일 소구역으로 제한한다", async () => {
    let bounds: string[] = [];
    const adapter = createItsCctvSourceAdapter({ apiKey: "fixture-key", fetcher: async (url) => {
      bounds = ["minX", "maxX", "minY", "maxY"].map((name) => url.searchParams.get(name)!);
      return { response: { data: [] } };
    } });
    await adapter.getSnapshot();
    expect(bounds).toEqual(["127.1", "127.12", "37.32", "37.35"]);
  });

  it("같은 설정의 API 요청들은 adapter 인스턴스와 캐시를 공유한다", () => {
    const env = { CCTV_SOURCE_MODE: "its", ITS_API_KEY: "fixture-cache-key" };
    expect(getConfiguredCctvSourceAdapter(env)).toBe(getConfiguredCctvSourceAdapter({ ...env }));
    expect(getConfiguredCctvSourceAdapter({ ...env, ITS_API_KEY: "fixture-other-key" })).not.toBe(getConfiguredCctvSourceAdapter(env));
  });

  it("동시에 들어온 조회는 하나의 업스트림 요청으로 합친다", async () => {
    let calls = 0;
    const adapter = createItsCctvSourceAdapter({ apiKey: "fixture-key", fetcher: async () => {
      calls += 1;
      await Promise.resolve();
      return { response: { data: [] } };
    } });
    const [first, second] = await Promise.all([adapter.getSnapshot(), adapter.getSnapshot()]);
    expect(calls).toBe(1);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("업스트림 fetch는 시간 제한과 redirect 차단을 사용한다", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ response: { data: [] } })));
    vi.stubGlobal("fetch", fetcher);
    try {
      await createItsCctvSourceAdapter({ apiKey: "fixture-key" }).getSnapshot();
      expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
        signal: expect.any(AbortSignal), redirect: "error", cache: "no-store",
      }));
    } finally { vi.unstubAllGlobals(); }
  });

  it("네트워크 예외의 민감한 메시지를 밖으로 전달하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fixture-sensitive-message"); }));
    try {
      await expect(createItsCctvSourceAdapter({ apiKey: "fixture-key" }).getSnapshot()).rejects.toThrow("ITS request failed");
    } finally { vi.unstubAllGlobals(); }
  });

  it("source adapter 오류 메시지에서 API 키와 URL query를 마스킹한다", () => {
    const message = redactSourceErrorMessage(
      "ITS API 403 https://openapi.its.go.kr:9443/cctvInfo?apiKey=test-key&type=ex&getType=json",
    );

    expect(message).toBe(
      "ITS API 403 https://openapi.its.go.kr:9443/cctvInfo?apiKey=***&type=ex&getType=json",
    );
    expect(message).not.toContain("test-key");
  });
});
