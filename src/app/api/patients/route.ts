import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { broadcast } from "@/lib/bus";
import { STAGES, Stage, VISIT_TYPE_META, minutesSince } from "@/lib/queue";

export const dynamic = "force-dynamic";

// GET /api/patients?stage=VITALS  → { waiting: [], inService: [] }
// GET /api/patients?scope=today   → all today's patients (reception table)
export async function GET(req: NextRequest) {
  await ensureSeed();
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const scope = searchParams.get("scope");

  const include = {
    vitals: true,
    prescription: true,
    labTests: { orderBy: { createdAt: "desc" as const } },
  };

  if (scope === "today") {
    const start = new Date(Date.now() - 24 * 3600 * 1000);
    const patients = await db.patient.findMany({
      where: { createdAt: { gte: start } },
      include,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({
      patients: patients.map((p) => ({ ...p, waitedMin: minutesSince(p.createdAt) })),
    });
  }

  if (!stage || !STAGES.includes(stage as Stage)) {
    return NextResponse.json({ error: "stage query param required" }, { status: 400 });
  }

  const [waiting, inService] = await Promise.all([
    db.patient.findMany({
      where: { stage, status: "WAITING" },
      include,
      orderBy: [{ priority: "desc" }, { stageEnteredAt: "asc" }],
    }),
    db.patient.findMany({
      where: { stage, status: "IN_SERVICE" },
      include,
      orderBy: { stageEnteredAt: "asc" },
    }),
  ]);

  return NextResponse.json({ waiting, inService });
}

// POST /api/patients — register a new patient
export async function POST(req: NextRequest) {
  await ensureSeed();
  const body = await req.json().catch(() => null);
  if (!body || !body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Patient name is required" }, { status: 400 });
  }

  // next ticket number
  const last = await db.patient.findFirst({ orderBy: { createdAt: "desc" } });
  const nums: number[] = [];
  const all = await db.patient.findMany({ select: { ticket: true } });
  for (const p of all) {
    const n = parseInt(p.ticket.replace(/^MC-/, ""), 10);
    if (!Number.isNaN(n)) nums.push(n);
  }
  const nextNum = Math.max(0, ...nums) + 1;
  const ticket = `MC-${String(nextNum).padStart(3, "0")}`;

  const patient = await db.patient.create({
    data: {
      ticket,
      name: String(body.name).trim(),
      age: body.age ? Number(body.age) : null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      visitType: body.visitType ?? "ANTENATAL",
      trimester: body.trimester ?? null,
      gestationWk: body.gestationWk ? Number(body.gestationWk) : null,
      lounge: body.lounge ?? "Lounge A",
      seat: body.seat ? String(body.seat) : String(Math.floor(Math.random() * 30 + 1)),
      priority: body.priority === "URGENT" || body.priority === "RED" ? body.priority : "ROUTINE",
      stage: "REGISTRATION",
      status: "WAITING",
      stageEnteredAt: new Date(),
      registeredBy: body.registeredBy ?? "Clerk E. Hara",
    },
  });

  await db.event.create({
    data: {
      patientId: patient.id,
      ticket,
      type: "REGISTER",
      title: "Registered at OPD Reception",
      detail: `Assigned Ticket ${ticket} • ${VISIT_TYPE_META[patient.visitType]?.hint ?? "New intake"}${patient.lounge ? ` • ${patient.lounge} Seat ${patient.seat}` : ""}`,
      meta: JSON.stringify({ lounge: patient.lounge, seat: patient.seat }),
    },
  });

  await broadcast("queue:update", { ticket, stage: "REGISTRATION" });
  return NextResponse.json({ patient }, { status: 201 });
}
