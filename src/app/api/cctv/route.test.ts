import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("bounded CCTV GET", () => {
  it("returns safe 502 JSON instead of mock feeds when a configured ITS request fails", async () => {
    vi.stubEnv("CCTV_SOURCE_MODE", "its");
    vi.stubEnv("ITS_API_KEY", "fixture-route-failure");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("private upstream context"); }));
    const response = await GET(new Request("https://example.test/api/cctv?minX=128&maxX=128.15&minY=36&maxY=36.15"));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ error: { source: "its", message: "ITS request failed" } });
    expect(body.feeds).toBeUndefined();
    expect(body.events).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("private upstream context");
  });
  it("passes a bounded query to ITS, coalesces route calls and never invents events or expands an empty result", async () => {
    vi.stubEnv("CCTV_SOURCE_MODE", "its");
    vi.stubEnv("ITS_API_KEY", "fixture-route-bounded");
    const fetcher = vi.fn<(url: URL) => Promise<Response>>(async () => new Response(JSON.stringify({ response: { data: [] } })));
    vi.stubGlobal("fetch", fetcher);
    const request = () => new Request("https://example.test/api/cctv?minX=128&maxX=128.15&minY=36&maxY=36.15");
    const responses = await Promise.all([GET(request()), GET(request())]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ feeds: [], events: [], meta: {
        source: "its", feedCount: 0, eventCount: 0, runtimeStatus: { effectiveMode: "its" },
      } });
    }
    expect((await GET(request())).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = fetcher.mock.calls[0][0];
    expect(Object.fromEntries(["minX", "maxX", "minY", "maxY", "type", "cctvType"].map((key) => [key, url.searchParams.get(key)])))
      .toEqual({ minX: "128", maxX: "128.15", minY: "36", maxY: "36.15", type: "ex", cctvType: "4" });
  });

  it("retains the original small default box when no query is supplied", async () => {
    vi.stubEnv("CCTV_SOURCE_MODE", "its");
    vi.stubEnv("ITS_API_KEY", "fixture-route-default");
    const fetcher = vi.fn<(url: URL) => Promise<Response>>(async () => new Response(JSON.stringify({ response: { data: [] } })));
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(new Request("https://example.test/api/cctv"));
    expect(response.status).toBe(200);
    const url = fetcher.mock.calls[0][0];
    expect(["minX", "maxX", "minY", "maxY"].map((key) => url.searchParams.get(key))).toEqual(["127.1", "127.12", "37.32", "37.35"]);
  });
  it("returns a generic 400 before any upstream fetch for invalid queries", async () => {
    vi.stubEnv("CCTV_SOURCE_MODE", "its");
    vi.stubEnv("ITS_API_KEY", "fixture-route-invalid");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ response: { data: [] } })));
    vi.stubGlobal("fetch", fetcher);
    for (const query of ["minX=127", "lat=37.3349123&lng=127.1049876",
      "minX=127&maxX=128&minY=37&maxY=37.15",
      "minX=127.001&maxX=127.15&minY=37&maxY=37.15",
      "minX=NaN&maxX=127.15&minY=37&maxY=37.15"]) {
      const response = await GET(new Request(`https://example.test/api/cctv?${query}`));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { message: "Invalid CCTV bounds" } });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
