import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { startOfTodayCat } from "@/lib/cat";
import { STAGES, Stage, STAGE_META, minutesSince, loadState } from "@/lib/queue";

export const dynamic = "force-dynamic";

// Soft capacity per stage used for the utilization bars on the flow map
const STAGE_CAP: Record<string, number> = {
  REGISTRATION: 11,
  VITALS: 13,
  CONSULTATION: 15,
  LAB: 9,
  REVIEW: 7,
  PHARMACY: 8,
};

// Baseline hourly throughput shape (relative to reception baseline of 22/hr)
const RATE_SHAPE: Record<string, number> = {
  REGISTRATION: 22,
  VITALS: 18,
  CONSULTATION: 14,
  LAB: 10,
  REVIEW: 6,
  PHARMACY: 16,
};

const NODE_META: Record<string, { label: string; sub: string; rateUnit: string; staffLabel: string }> = {
  REGISTRATION: { label: "OPD Reception", sub: "Intake & Registration", rateUnit: "reg/hr", staffLabel: "Staff Active" },
  VITALS: { label: "Vitals & Triage", sub: "BP, Weight & Fetal Doppler", rateUnit: "vitals/hr", staffLabel: "Nurses Active" },
  CONSULTATION: { label: "Doctor Consult", sub: "Rooms 01 - 05", rateUnit: "consults/hr", staffLabel: "Docs Online" },
  LAB: { label: "Lab Diagnostic", sub: "Rapid Bloods & Urinalysis", rateUnit: "tests/hr", staffLabel: "Technicians" },
  REVIEW: { label: "Doctor Review", sub: "Return Cases & Plans", rateUnit: "reviews/hr", staffLabel: "Docs Active" },
  PHARMACY: { label: "Pharmacy", sub: "Dispensation & Advice", rateUnit: "disp/hr", staffLabel: "Pharm Techs" },
};

export async function GET() {
  await ensureSeed();
  const today = startOfTodayCat();
  const hourAgo = new Date(Date.now() - 3600000);

  const [patients, settingsRaw, staff, recentEvents, alertEvents, regEventsLastHour, eventCount] = await Promise.all([
    db.patient.findMany({
      where: { createdAt: { gte: today } },
      include: { vitals: true, prescription: true },
      orderBy: { createdAt: "asc" },
    }),
    db.setting.findMany(),
    db.staff.findMany({ where: { active: true } }),
    db.event.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.event.findMany({ where: { type: "ALERT" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.event.count({ where: { type: "REGISTER", createdAt: { gte: hourAgo } } }),
    db.event.count({ where: { createdAt: { gte: today } } }),
  ]);

  const settings = Object.fromEntries(settingsRaw.map((s) => [s.key, s.value]));
  const completed = patients.filter((p) => p.status === "COMPLETED");
  const waiting = patients.filter((p) => p.status === "WAITING");
  const inService = patients.filter((p) => p.status === "IN_SERVICE");

  // KPIs
  const waitSamples = completed
    .map((p) => (p.stageEnteredAt.getTime() - p.createdAt.getTime()) / 60000)
    .filter((v) => v > 0 && v < 240);
  const avgWaitMin = waitSamples.length
    ? Math.round((waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length) * 10) / 10
    : 0;

  // Longest queue = stage whose longest current wait is the highest
  const perStage = STAGES.filter((s) => s !== "COMPLETED").map((stage) => {
    const w = waiting.filter((p) => p.stage === stage);
    const longest = w.reduce((mx, p) => Math.max(mx, minutesSince(p.stageEnteredAt)), 0);
    const svc = inService.filter((p) => p.stage === stage);
    return { stage, waiting: w, inService: svc, count: w.length, longest };
  });

  const longest = perStage.reduce(
    (best, s) => (s.longest > best.longest ? s : best),
    perStage[0]
  );

  const kpis = {
    registeredToday: patients.length,
    waiting: waiting.length,
    attended: inService.length,
    completed: completed.length,
    avgWaitMin,
    targetWaitMin: Number(settings.targetWaitMin ?? 20),
    longestQueue: {
      stage: longest.stage as Stage,
      label: STAGE_META[longest.stage as Stage].short + " Bay",
      mins: longest.longest,
    },
    wardOccupancyPct: Number(settings.wardOccupancyPct ?? 74),
  };

  // Flow map nodes
  const staffByStation: Record<string, number> = {};
  for (const st of staff) staffByStation[st.station] = (staffByStation[st.station] ?? 0) + 1;
  const regRate = Math.max(6, regEventsLastHour);
  const baseline = RATE_SHAPE.REGISTRATION;

  const nodes = perStage.map((s) => {
    const meta = NODE_META[s.stage];
    const rate = Math.max(1, Math.round((regRate * RATE_SHAPE[s.stage]) / baseline));
    const cap = STAGE_CAP[s.stage];
    const util = Math.min(95, Math.max(6, Math.round((s.count / cap) * 100)));
    const state = util >= 82 ? "HIGH" : util >= 55 ? "MODERATE" : "SMOOTH";
    return {
      stage: s.stage,
      node: STAGE_META[s.stage as Stage].node,
      label: meta.label,
      sub: meta.sub,
      rate,
      rateUnit: meta.rateUnit,
      util,
      waiting: s.count,
      inService: s.inService.length,
      staff: staffByStation[s.stage] ?? 0,
      staffLabel: meta.staffLabel,
      longestWait: s.longest,
      state,
    };
  });

  // Bottleneck radar alerts
  const consultTarget = Number(settings.consultTargetMin ?? 24);
  type Alert = {
    id: string;
    kind: "triage" | "centrifuge" | "overrun" | "escalation";
    severity: "HIGH" | "MEDIUM";
    title: string;
    chip: string;
    body: string;
    meta: string[];
    patientId?: string;
    eventId?: string;
    roomId?: string;
    actionLabel: string;
    secondaryLabel?: string;
  };
  const alerts: Alert[] = [];

  // 1. Red-priority triage flags
  for (const p of inService.concat(waiting).filter((p) => p.priority === "RED" && p.stage === "VITALS")) {
    const v = p.vitals;
    const bay = p.roomId === "vitals-1" ? "Vitals Station 1" : p.roomId === "vitals-2" ? "Vitals Station 2" : "Vitals Station 3";
    alerts.push({
      id: `triage-${p.id}`,
      kind: "triage",
      severity: "HIGH",
      title: `Urgent Triage Alert: ${p.name} Priority Flag`,
      chip: "Priority Red",
      body:
        v?.notes ??
        `Elevated maternal BP (${v?.systolic ?? "—"}/${v?.diastolic ?? "—"}) in ${bay}${
          v && v.tempC >= 38.5 ? ` with accompanying fever (${v.tempC}°C)` : ""
        }. Immediate expedited consultation pathway suggested.`,
      meta: [
        `Location: ${bay}`,
        `Flagged by: ${v?.recordedBy ?? "Triage"}`,
        `Elapsed: ${minutesSince(p.stageEnteredAt)} mins ago`,
      ],
      patientId: p.id,
      actionLabel: "Fast Track to Room 01",
    });
  }

  // 2. Unresolved equipment / system alerts (centrifuge etc.)
  for (const ev of alertEvents) {
    if (ev.type !== "ALERT") continue;
    let meta: Record<string, unknown> = {};
    try { meta = ev.meta ? JSON.parse(ev.meta) : {}; } catch { /* ignore */ }
    if (meta.kind === "centrifuge" && !meta.resolved) {
      alerts.push({
        id: `centrifuge-${ev.id}`,
        kind: "centrifuge",
        severity: "HIGH",
        title: ev.title,
        chip: `Delay +${meta.etaMin ?? 8}m`,
        body: ev.detail ?? "",
        meta: [
          `ETA to Resolution: ${meta.etaMin ?? 12} mins`,
          `Impacted Queue: ${meta.impacted ?? "Lab"}`,
        ],
        eventId: ev.id,
        actionLabel: "Route to Satellite Lab",
        secondaryLabel: "Mark Resolved",
      });
    }
    if (meta.kind === "escalation" && !meta.resolved) {
      alerts.push({
        id: `escalation-${ev.id}`,
        kind: "escalation",
        severity: "MEDIUM",
        title: "Capacity Escalation Raised",
        chip: "Escalated",
        body: "Escalate Capacity Alert was raised from the Command Centre. Ward C is nearing bed capacity — consider overflow routing.",
        meta: [`Raised: ${minutesSince(ev.createdAt)} mins ago`],
        eventId: ev.id,
        actionLabel: "Mark Resolved",
      });
    }
  }

  // 3. Consult overruns
  for (const p of inService.filter((x) => x.stage === "CONSULTATION")) {
    const active = minutesSince(p.stageEnteredAt);
    if (active > consultTarget) {
      const room = p.roomId ?? "";
      const label = room.startsWith("consult-")
        ? `Room ${room.slice(-2)}`
        : room === "sono-1" ? "Sonography Bay 1" : "Consultation";
      alerts.push({
        id: `overrun-${p.id}`,
        kind: "overrun",
        severity: "MEDIUM",
        title: `Doctor ${label} Overrunning Consult Duration`,
        chip: `${active}m active`,
        body: `Patient ${p.ticket} (${p.name}) has been in consultation ${active} minutes — exceeding the ${consultTarget}m standard buffer. Waiting mothers in ${p.lounge ?? "the lounge"} are being delayed.`,
        meta: [`Assigned bay: ${label}`, `Buffer Exceeded: +${active - consultTarget} mins`],
        patientId: p.id,
        roomId: room,
        actionLabel: "Split Waiting Queue",
        secondaryLabel: "Nudge Completion",
      });
    }
  }

  // Live feed (latest 6)
  const feed = recentEvents.slice(0, 6).map((ev) => {
    let meta: Record<string, unknown> = {};
    try { meta = ev.meta ? JSON.parse(ev.meta) : {}; } catch { /* ignore */ }
    return {
      id: ev.id,
      ticket: ev.ticket,
      type: ev.type,
      title: ev.title,
      detail: ev.detail,
      tag: (meta.tag as string) ?? null,
      extra: (meta.extra as string) ?? null,
      gate: (meta.gate as string) ?? null,
      at: ev.createdAt.toISOString(),
    };
  });

  const loungeLoad = ["Lounge A", "Lounge B", "Lounge C"].map((l) => ({
    lounge: l,
    waiting: waiting.filter((p) => p.lounge === l).length,
  }));

  return NextResponse.json({
    kpis,
    nodes,
    alerts,
    feed,
    eventCount,
    loungeLoad,
    settings,
    journeyVelocity: settings.journeyVelocity ?? "3.2",
  });
}
