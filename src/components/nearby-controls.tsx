"use client";

export type NearbyStatus = "idle" | "locating" | "loading" | "ready" | "error";

export function NearbyControls({ status, message, hasLocation, onLocate, onClear }: {
  status: NearbyStatus;
  message: string;
  hasLocation: boolean;
  onLocate: () => void;
  onClear: () => void;
}) {
  const busy = status === "locating" || status === "loading";
  return (
    <section aria-label="내 위치 주변 고속도로 CCTV" className="border border-[#e0e0e0] bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-medium">내 위치 주변 고속도로 CCTV</h2>
          <p className="mt-1 text-sm text-[#525252]">위치에 동의하면 조회 범위 내 CCTV를 직선거리 순으로 보여드립니다. 가장 가까운 고속도로 진입로나 주행 경로 안내는 아닙니다.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-sm">
          <button type="button" disabled={busy} onClick={onLocate} className="border border-[#0f62fe] px-3 py-2 text-[#0f62fe] hover:bg-[#edf5ff] disabled:cursor-wait disabled:border-[#8d8d8d] disabled:text-[#6f6f6f]">
            {busy ? "주변 확인 중" : "위치 동의하고 주변 보기"}
          </button>
          {hasLocation || busy ? <button type="button" onClick={onClear} className="border border-[#8d8d8d] px-3 py-2 text-[#525252] hover:bg-[#f4f4f4]">위치 사용 중지</button> : null}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#6f6f6f]">정밀 위치는 브라우저 메모리에서만 사용하고 저장하지 않습니다. 주변 조회에는 0.05도 격자로 묶은 구역만 서버로 보내며, 지도 제공자는 IP와 요청한 지도 구역을 알 수 있습니다. 위치를 허용하지 않아도 기본 구역을 볼 수 있습니다.</p>
      {message ? <p role="status" aria-live="polite" className={`mt-3 text-sm ${status === "error" ? "text-[#a2191f]" : "text-[#525252]"}`}>{message}</p> : null}
    </section>
  );
}
