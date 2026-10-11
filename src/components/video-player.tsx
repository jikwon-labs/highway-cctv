"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

import type { CctvFeed } from "@/lib/cctv";
import { getPlaybackStrategy } from "@/lib/playback";

export function VideoPlayer({ feed }: { feed: CctvFeed }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hlsState, setHlsState] = useState("HLS 대기 중");
  const strategy = getPlaybackStrategy(feed.streamUrl, feed.streamType);
  const playerState = getPlayerState(strategy, hlsState);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !feed.streamUrl || strategy === "placeholder") {
      return;
    }

    if (strategy === "native-video") {
      video.src = feed.streamUrl;
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = feed.streamUrl;
      return;
    }

    if (!Hls.isSupported()) {
      queueMicrotask(() => setHlsState("이 브라우저는 HLS를 지원하지 않음"));
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
    });

    hls.loadSource(feed.streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setHlsState("HLS 매니페스트 로드 완료");
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      setHlsState(data.fatal ? "HLS 치명 오류" : "HLS 복구 가능 오류");
    });

    return () => {
      hls.destroy();
    };
  }, [feed.streamUrl, strategy]);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.22),transparent_35%),linear-gradient(135deg,#101827,#05080d)]">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/10 bg-black/30 px-5 py-3 text-xs text-slate-300 backdrop-blur">
        <span>{strategy === "hls" ? "HLS PLAYER READY" : "VIDEO REVIEW PREVIEW"}</span>
        <span>{playerState}</span>
      </div>

      {strategy === "placeholder" ? (
        <PlaceholderOverlay />
      ) : (
        <video
          ref={videoRef}
          className="h-full min-h-[420px] w-full object-cover"
          controls
          muted
          playsInline
          preload="metadata"
        />
      )}

      <AiOverlay />
    </div>
  );
}

function getPlayerState(strategy: ReturnType<typeof getPlaybackStrategy>, hlsState: string) {
  if (strategy === "placeholder") {
    return "실제 스트림 연결 전";
  }

  if (strategy === "native-video") {
    return "네이티브 비디오 준비";
  }

  return hlsState;
}

function PlaceholderOverlay() {
  return (
    <div className="z-10 max-w-md rounded-3xl border border-white/10 bg-black/45 p-6 text-center backdrop-blur">
      <p className="text-sm font-medium text-cyan-200">실제 CCTV 연결 전</p>
      <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white">HLS 플레이어 준비 완료</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        API 키/약관/트래픽/저장 가능 여부 확인 후 streamUrl만 연결하면 HLS.js 또는 브라우저 네이티브 HLS로 재생합니다.
      </p>
    </div>
  );
}

function AiOverlay() {
  return (
    <>
      <div className="pointer-events-none absolute left-[18%] top-[34%] h-24 w-36 rounded-xl border-2 border-rose-400 bg-rose-500/10 shadow-[0_0_40px_rgba(244,63,94,0.35)]" />
      <div className="pointer-events-none absolute right-[20%] top-[48%] h-20 w-32 rounded-xl border-2 border-cyan-300 bg-cyan-400/10" />
      <div className="pointer-events-none absolute bottom-[25%] left-[42%] h-16 w-28 rounded-xl border-2 border-amber-300 bg-amber-400/10" />
    </>
  );
}
