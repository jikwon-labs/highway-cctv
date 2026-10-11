"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

import type { CctvFeed } from "@/lib/cctv";
import { getPlaybackStrategy } from "@/lib/playback";

export function VideoPlayer({ feed }: { feed: CctvFeed }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hlsState, setHlsState] = useState("HLS 대기");
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
      queueMicrotask(() => setHlsState("HLS 미지원"));
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
      setHlsState("HLS 준비됨");
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      setHlsState(data.fatal ? "HLS 오류" : "HLS 복구 중");
    });

    return () => {
      hls.destroy();
    };
  }, [feed.streamUrl, strategy]);

  return (
    <div className="relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden border border-[#c6c6c6] bg-[#161616]">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-[#393939] bg-[#262626] px-4 py-2 font-mono text-xs text-[#c6c6c6]">
        <span>{strategy === "hls" ? "HLS" : "Preview"}</span>
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

      <SceneGuides />
    </div>
  );
}

function getPlayerState(strategy: ReturnType<typeof getPlaybackStrategy>, hlsState: string) {
  if (strategy === "placeholder") {
    return "영상 연결 대기";
  }

  if (strategy === "native-video") {
    return "비디오 준비";
  }

  return hlsState;
}

function PlaceholderOverlay() {
  return (
    <div className="z-10 mx-6 max-w-md border border-[#525252] bg-[#262626] p-5 text-left">
      <p className="font-mono text-xs text-[#c6c6c6]">No stream connected</p>
      <h3 className="mt-3 text-2xl font-normal text-white">영상 연결 대기</h3>
      <p className="mt-3 text-sm leading-6 text-[#c6c6c6]">
        ITS 키와 이용 조건이 확인되면 streamUrl을 연결합니다. 그 전에는 영상 저장이나 대량 호출을 하지 않습니다.
      </p>
    </div>
  );
}

function SceneGuides() {
  return (
    <>
      <div className="pointer-events-none absolute left-[18%] top-[34%] h-24 w-36 border-2 border-[#da1e28] bg-[#da1e28]/10" />
      <div className="pointer-events-none absolute right-[20%] top-[48%] h-20 w-32 border-2 border-[#0f62fe] bg-[#0f62fe]/10" />
      <div className="pointer-events-none absolute bottom-[25%] left-[42%] h-16 w-28 border-2 border-[#f1c21b] bg-[#f1c21b]/10" />
    </>
  );
}
