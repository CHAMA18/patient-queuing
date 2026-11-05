"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

/**
 * Subscribes to live queue broadcasts from the queue-service mini service.
 * Falls back gracefully (polling still keeps data fresh) if socket fails.
 */
export function useQueueSocket(onUpdate: () => void): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Never use PORT in the URL, always use XTransformPort (Caddy gateway)
    const socket: Socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("queue:update", () => onUpdate());

    return () => {
      socket.disconnect();
    };
  }, [onUpdate]);

  return connected;
}

/** Ticking wall-clock for headers and TV board (SSR-safe: null until mounted) */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const t0 = setTimeout(update, 0);
    const t = setInterval(update, intervalMs);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}
