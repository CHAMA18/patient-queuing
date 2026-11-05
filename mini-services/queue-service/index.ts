import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003; // socket.io (reached via Caddy gateway with XTransformPort)
const EMIT_PORT = 3004; // internal-only HTTP push endpoint used by Next.js API routes

const io = new Server(
  createServer().listen(PORT, () => {
    console.log(`[queue-service] socket.io listening on port ${PORT}`);
  }),
  {
    // DO NOT change the path, it is used by Caddy to forward the request to the correct port
    path: "/",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  }
);

// Internal push endpoint: POST /emit { type, payload } -> io.emit(type, payload)
// Kept on a separate port because engine.io owns every request under "/" on PORT.
createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/emit")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { type, payload } = JSON.parse(body || "{}");
        io.emit(String(type || "queue:update"), payload ?? {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, clients: io.engine.clientsCount }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ service: "moms-care-flow-queue-service", status: "ok" }));
}).listen(EMIT_PORT, () => {
  console.log(`[queue-service] emit endpoint listening on port ${EMIT_PORT}`);
});

io.on("connection", (socket) => {
  console.log(`[queue-service] client connected (${io.engine.clientsCount} online)`);
  socket.on("disconnect", () => {
    console.log(`[queue-service] client disconnected (${io.engine.clientsCount} online)`);
  });
});
