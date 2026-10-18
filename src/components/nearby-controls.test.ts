import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NearbyControls } from "./nearby-controls";

describe("동의 기반 주변 CCTV 컨트롤", () => {
  it("초기 렌더에서는 위치 요청 없이 동의와 개인정보 안내를 표시한다", () => {
    const locate = vi.fn();
    const html = renderToStaticMarkup(createElement(NearbyControls, {
      status: "idle", message: "", hasLocation: false, onLocate: locate, onClear: vi.fn(),
    }));
    expect(locate).not.toHaveBeenCalled();
    expect(html).toContain("위치 동의하고 주변 보기");
    expect(html).toContain("저장하지 않습니다");
    expect(html).toContain("직선거리");
  });
  it("위치 요청 중 중지 버튼으로 취소할 수 있다", () => {
    const html = renderToStaticMarkup(createElement(NearbyControls, {
      status: "locating", message: "위치 권한 확인 중", hasLocation: false, onLocate: vi.fn(), onClear: vi.fn(),
    }));
    expect(html).toContain("위치 권한 확인 중");
    expect(html).toContain("위치 사용 중지");
    expect(html).toContain('aria-live="polite"');
  });
});
