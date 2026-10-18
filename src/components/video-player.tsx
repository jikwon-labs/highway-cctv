"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

import type { CctvFeed } from "@/lib/cctv";
import { getPlaybackStrategy, getHlsEngine, getPlaybackErrorMessage } from "@/lib/playback";

export function VideoPlayer({ feed }: { feed: CctvFeed }) {
  if (getPlaybackStrategy(feed.streamUrl, feed.streamType) === "placeholder") {
    return <ConnectedVideo feed={feed} />;
  }
  // A different CCTV or refreshed URL requires a new explicit playback action.
  return <PlaybackSession key={`${feed.id}:${feed.streamUrl}`} feed={feed} />;
}

function PlaybackSession({ feed }: { feed: CctvFeed }) {
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!requested) {
    return (
      <div className="flex min-h-[420px] items-center justify-center border border-[#c6c6c6] bg-[#161616] p-6 text-white">
        <div className="max-w-md">
          <p className="text-xs text-[#c6c6c6]">출처: {feed.source}</p>
          <h3 className="mt-3 text-2xl font-normal">영상 URL 수신 · 재생 전</h3>
          <p className="mt-3 text-sm leading-6 text-[#c6c6c6]">목록 조회만으로 영상에 연결하지 않습니다. 이용조건을 확인한 뒤 시작하세요. 영상 저장이나 AI 분석은 하지 않습니다.</p>
          <button className="mt-5 bg-[#0f62fe] px-4 py-3 text-sm text-white hover:bg-[#0043ce]" type="button" onClick={() => setRequested(true)}>영상 연결 시작</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border border-[#c6c6c6] bg-[#f4f4f4] p-3 text-sm">
        <span>출처: {feed.source} · 저장/분석 없음</span>
        <div className="flex shrink-0 gap-3"><button className="text-[#0f62fe] underline" type="button" onClick={() => setAttempt((value) => value + 1)}>다시 연결</button><button className="text-[#0f62fe] underline" type="button" onClick={() => setRequested(false)}>영상 연결 중지</button></div>
      </div>
      <ConnectedVideo key={attempt} feed={feed} />
    </div>
  );
}

function ConnectedVideo({ feed }: { feed: CctvFeed }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaState, setMediaState] = useState("영상 연결 중");
  const strategy = getPlaybackStrategy(feed.streamUrl, feed.streamType);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !feed.streamUrl || strategy === "placeholder") return;

    function clearVideo() {
      video!.pause();
      video!.removeAttribute("src");
      video!.load();
    }
    const engine = strategy === "native-video" ? "native" : getHlsEngine(Hls.isSupported(), video.canPlayType("application/vnd.apple.mpegurl"));
    video.dataset.playbackEngine = engine;
    if (engine === "native") {
      video.src = feed.streamUrl;
      return clearVideo;
    }
    if (engine === "unsupported") {
      queueMicrotask(() => setMediaState("HLS 미지원"));
      return;
    }
    const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 0 });
    hls.on(Hls.Events.MANIFEST_PARSED, () => setMediaState("영상 재생 준비됨"));
    hls.on(Hls.Events.ERROR, (_, data) => {
      setMediaState(data.fatal ? getPlaybackErrorMessage({ hlsType: data.type, details: data.details, httpStatus: data.response?.code }) : "영상 연결 복구 중");
      if (data.fatal) hls.stopLoad();
    });
    hls.loadSource(feed.streamUrl);
    hls.attachMedia(video);
    return () => { hls.destroy(); clearVideo(); };
  }, [feed.streamUrl, strategy]);

  return (
    <div className="relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden border border-[#c6c6c6] bg-[#161616]">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-[#393939] bg-[#262626] px-4 py-2 text-xs text-[#c6c6c6]" aria-live="polite">
        <span>{strategy === "hls" ? "HLS" : "영상"}</span>
        <span>{strategy === "placeholder" ? "영상 연결 대기" : mediaState}</span>
      </div>
      {strategy === "placeholder" ? (
        <div className="z-10 mx-6 max-w-md border border-[#525252] bg-[#262626] p-5 text-left">
          <h3 className="text-2xl font-normal text-white">영상 연결 대기</h3>
          <p className="mt-3 text-sm leading-6 text-[#c6c6c6]">연결 가능한 영상 주소가 없습니다. 샘플 모드 또는 지원하지 않는 영상 형식인지 확인하세요.</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="h-full min-h-[420px] w-full object-contain"
          controls muted playsInline preload="metadata"
          onPlaying={() => setMediaState("영상 재생 중")}
          onWaiting={() => setMediaState("영상 버퍼링 중")}
          onError={() => setMediaState(getPlaybackErrorMessage({ mediaCode: videoRef.current?.error?.code }))}
        />
      )}
    </div>
  );
}
