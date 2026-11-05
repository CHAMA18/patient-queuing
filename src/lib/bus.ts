// Server-side helper: notify the socket.io mini-service (port 3003) so all
// connected clients refresh instantly. Silently no-ops if the service is down.
export async function broadcast(type: string, payload?: unknown): Promise<void> {
  try {
    await fetch("http://127.0.0.1:3004/emit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, payload }),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // mini-service not running yet — polling fallback keeps UI fresh
  }
}
