import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { broadcast } from "@/lib/bus";

export const dynamic = "force-dynamic";

// POST /api/actions — Command Centre quick actions
// body: { action: "fast-track" | "route-satellite" | "split-queue" | "broadcast" | "overflow" | "reallocate" | "escalate" | "resolve-alert", ... }
export async function POST(req: NextRequest) {
  await ensureSeed();
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const ev = (type: string, title: string, detail?: string, meta?: Record<string, unknown>) =>
    db.event.create({ data: { type, title, detail: detail ?? null, ticket: body.ticket ?? null, meta: meta ? JSON.stringify(meta) : null } });

  try {
    switch (action) {
      case "fast-track": {
        const patientId = body.patientId as string | undefined;
        const red = patientId
          ? await db.patient.findUnique({ where: { id: patientId } })
          : await db.patient.findFirst({ where: { priority: "RED", stage: "VITALS" }, orderBy: { stageEnteredAt: "asc" } });
        if (!red) return NextResponse.json({ error: "No red-flag patient found" }, { status: 404 });
        const room = body.roomId ?? "consult-01";
        const updated = await db.patient.update({
          where: { id: red.id },
          data: { stage: "CONSULTATION", status: "WAITING", roomId: room, stageEnteredAt: new Date(), lounge: "Lounge B" },
        });
        await db.event.create({
          data: {
            patientId: red.id, ticket: red.ticket, type: "ACTION",
            title: `Fast-Tracked → Room ${room.slice(-2)}`,
            detail: `${red.name} (${red.ticket}) expedited to the front of the consultation queue on Priority Red.`,
            meta: { fastTrack: true },
          },
        });
        await broadcast("queue:update", { ticket: red.ticket, stage: "CONSULTATION" });
        return NextResponse.json({ ok: true, patient: updated });
      }

      case "route-satellite": {
        if (body.eventId) {
          const e = await db.event.findUnique({ where: { id: body.eventId } });
          if (e) {
            let meta: Record<string, unknown> = {};
            try { meta = e.meta ? JSON.parse(e.meta) : {}; } catch { /* ignore */ }
            meta.resolved = true;
            await db.event.update({ where: { id: e.id }, data: { meta: JSON.stringify(meta) } });
          }
        }
        await ev("ACTION", "Routed to Satellite Lab", "Specimen overflow re-routed to the Satellite Lab at Wing B; Centrifuge 02 alert cleared.");
        await broadcast("queue:update", {});
        return NextResponse.json({ ok: true });
      }

      case "resolve-alert": {
        if (body.eventId) {
          const e = await db.event.findUnique({ where: { id: body.eventId } });
          if (e) {
            let meta: Record<string, unknown> = {};
            try { meta = e.meta ? JSON.parse(e.meta) : {}; } catch { /* ignore */ }
            meta.resolved = true;
            await db.event.update({ where: { id: e.id }, data: { meta: JSON.stringify(meta) } });
          }
        }
        await ev("ACTION", "Alert Resolved", body.reason ?? "Bottleneck alert marked resolved by command centre.");
        await broadcast("queue:update", {});
        return NextResponse.json({ ok: true });
      }

      case "split-queue": {
        const roomId = (body.roomId as string) ?? "";
        const queue = await db.patient.findMany({
          where: { stage: { in: ["CONSULTATION", "VITALS", "PHARMACY"] }, status: "WAITING", OR: [{ roomId }, { roomId: null }] },
          orderBy: { stageEnteredAt: "desc" },
        });
        const pool = roomId ? queue.filter((p) => p.roomId === roomId) : queue;
        const half = Math.floor(pool.length / 2);
        const targets = await db.patient.findMany({
          where: { stage: pool[0]?.stage ?? "CONSULTATION", status: "WAITING", roomId: { not: null, notIn: roomId ? [roomId] : [] } },
          distinct: ["roomId"],
          select: { roomId: true },
        });
        const alt = targets[0]?.roomId ?? null;
        let moved = 0;
        for (const p of pool.slice(0, half)) {
          await db.patient.update({ where: { id: p.id }, data: { roomId: alt } });
          moved++;
        }
        await ev("ACTION", "Waiting Queue Split", `${moved} patient(s) re-balanced from ${roomId || "unassigned queue"} to ${alt ?? "general queue"} to relieve the buffer.`);
        await broadcast("queue:update", {});
        return NextResponse.json({ ok: true, moved });
      }

      case "broadcast": {
        const message = body.message ?? "Queue update broadcast to all lounges and TV displays.";
        await ev("SYSTEM", "Queue Update Broadcast", message);
        await broadcast("queue:update", { broadcast: true });
        return NextResponse.json({ ok: true });
      }

      case "overflow": {
        const s = await db.setting.findUnique({ where: { key: "overflowOpen" } });
        const opening = s?.value !== "true";
        await db.setting.upsert({ where: { key: "overflowOpen" }, create: { key: "overflowOpen", value: opening ? "true" : "false" }, update: { value: opening ? "true" : "false" } });
        if (opening) {
          const overloaded = await db.patient.findMany({
            where: { stage: "CONSULTATION", status: "WAITING" },
            orderBy: { stageEnteredAt: "asc" },
            take: 2,
          });
          for (const p of overloaded) {
            await db.patient.update({ where: { id: p.id }, data: { roomId: "consult-06" } });
          }
          await ev("ACTION", "Overflow Room Triggered", `Overflow Bay opened${overloaded.length ? ` — ${overloaded.length} longest-waiting mother(s) re-routed` : ""}.`);
        } else {
          await ev("ACTION", "Overflow Room Closed", "Overflow Bay closed; patients re-absorbed into main rooms.");
          await db.patient.updateMany({ where: { roomId: "consult-06" }, data: { roomId: "consult-05" } });
        }
        await broadcast("queue:update", {});
        return NextResponse.json({ ok: true, open: opening });
      }

      case "reallocate": {
        const next = await db.patient.findFirst({
          where: { stage: "VITALS", status: "WAITING" },
          orderBy: [{ priority: "desc" }, { stageEnteredAt: "asc" }],
        });
        if (next) {
          await db.patient.update({ where: { id: next.id }, data: { status: "IN_SERVICE", roomId: "vitals-1", stageEnteredAt: new Date() } });
        }
        await ev("ACTION", "Nurse Station Reallocated", next ? `${next.ticket} pulled forward to Vitals Bay 1 with the reallocated triage nurse.` : "Triage nurse reallocated; no patients waiting.");
        await broadcast("queue:update", {});
        return NextResponse.json({ ok: true });
      }

      case "escalate": {
        await ev("ALERT", "Capacity Escalation Raised", "Escalate Capacity Alert raised from the Command Centre — Ward C nearing bed capacity.", { kind: "escalation", resolved: false });
        await broadcast("queue:update", { escalated: true });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("POST /api/actions failed", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
