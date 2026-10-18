"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createNearbySession, type NearbySessionOptions } from "@/lib/nearby-session";

export type { NearbyStatus, UserPosition } from "@/lib/nearby-session";

export function useNearbyCctv(options: NearbySessionOptions) {
  const latest = useRef(options);
  const [session] = useState(() => createNearbySession(options));
  useEffect(() => {
    latest.current = options;
    session.updateCallbacks({
      onSnapshot: (snapshot, selectNearest) => latest.current.onSnapshot(snapshot, selectNearest),
      onClear: () => latest.current.onClear(),
    });
  }, [options, session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);

  // Silent cancellation also handles Strict Mode's cleanup/setup replay. It
  // invalidates pending permission and fetch callbacks without resetting the parent.
  useEffect(() => () => session.cancel(), [session]);

  return { ...state, onRefresh: session.onRefresh, onLocate: session.onLocate, onClear: session.onClear };
}
