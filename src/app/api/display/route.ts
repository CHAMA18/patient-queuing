import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { STAGES, STAGE_META } from "@/lib/queue";

export const dynamic = "force-dynamic";

const ROOM_LABELS: Record<string, string> = {
  "consult-01": "Consultation Room 01",
  "consult-02": "Consultation Room 02",
  "consult-03": "Consultation Room 03",
  "consult-04": "Consultation Room 04",
  "consult-05": "Consultation Room 05",
  "consult-06": "Overflow Bay",
  "vitals-1": "Vitals Bay 1",
  "vitals-2": "Vitals Bay 2",
  "vitals-3": "Vitals Bay 3",
  "lab-1": "Lab Bay 1",
  "lab-2": "Lab Bay 2",
  "pharm-1": "Dispensing Window 1",
  "pharm-2": "Dispensing Window 2",
  "sono-1": "Sonography Bay 1",
};

// GET /api/display — data for the Waiting TV Displays board
export async function GET() {
  await ensureSeed();
  const [patients, settingsRaw] = await Promise.all([
    db.patient.findMany({
      where: { status: { in: ["WAITING", "IN_SERVICE"] } },
      orderBy: { stageEnteredAt: "asc" },
    }),
    db.setting.findMany(),
  ]);
  const settings = Object.fromEntries(settingsRaw.map((s) => [s.key, s.value]));

  const nowServing: Array<{ room: string; label: string; ticket: string; name: string; since: string; stage: string }> = [];
  const queues: Record<string, { stage: string; label: string; waiting: number; next: string[] }> = {};

  for (const stage of STAGES) {
    if (stage === "COMPLETED") continue;
    const waiting = patients.filter((p) => p.stage === stage && p.status === "WAITING");
    queues[stage] = {
      stage,
      label: STAGE_META[stage].label,
      waiting: waiting.length,
      next: waiting.slice(0, 6).map((p) => p.ticket),
    };
  }

  for (const p of patients.filter((x) => x.status === "IN_SERVICE")) {
    if (!p.roomId) continue;
    nowServing.push({
      room: p.roomId,
      label: ROOM_LABELS[p.roomId] ?? p.roomId,
      ticket: p.ticket,
      name: p.name,
      since: p.stageEnteredAt.toISOString(),
      stage: p.stage,
    });
  }

  // order display columns
  const order = ["vitals-1", "vitals-2", "vitals-3", "consult-01", "consult-02", "consult-03", "consult-04", "consult-05", "consult-06", "sono-1", "lab-1", "lab-2", "pharm-1", "pharm-2"];
  nowServing.sort((a, b) => order.indexOf(a.room) - order.indexOf(b.room));

  return NextResponse.json({
    nowServing,
    queues,
    settings: {
      hospitalName: settings.hospitalName,
      wing: settings.wing,
      wardOccupancyPct: settings.wardOccupancyPct,
      overflowOpen: settings.overflowOpen === "true",
    },
  });
}
