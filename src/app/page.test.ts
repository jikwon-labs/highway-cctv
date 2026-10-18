import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("next/server", () => ({ connection: async () => {} }));

describe("실제 모드의 초기 화면", () => {
  it("실제 모드에서는 샘플 CCTV나 감지 결과를 실제 정보처럼 표시하지 않는다", async () => {
    vi.stubEnv("CCTV_SOURCE_MODE", "its");
    vi.stubEnv("ITS_API_KEY", "fixture-key");
    try {
      const stream = await renderToReadableStream(createElement(Home));
      await stream.allReady;
      const html = await new Response(stream).text();
      expect(html).toContain("ITS 실제 소스");
      expect(html).toContain("조회 전");
      expect(html).not.toContain("정지 차량 후보");
      expect(html).not.toContain("서울요금소");
    } finally { vi.unstubAllEnvs(); }
  });
});
