import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { startOfTodayCat } from "@/lib/cat";
import { STAGE_META, Stage, minutesSince } from "@/lib/queue";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/report — daily operational report (CSV download)
export async function GET() {
  await ensureSeed();
  const today = startOfTodayCat();
  const patients = await db.patient.findMany({
    where: { createdAt: { gte: today } },
    include: { vitals: true, prescription: true },
    orderBy: { createdAt: "asc" },
  });
  const events = await db.event.count({ where: { createdAt: { gte: today } } });

  const completed = patients.filter((p) => p.status === "COMPLETED");
  const waiting = patients.filter((p) => p.status === "WAITING");
  const inService = patients.filter((p) => p.status === "IN_SERVICE");
  const waits = completed
    .map((p) => (p.stageEnteredAt.getTime() - p.createdAt.getTime()) / 60000)
    .filter((v) => v > 0 && v < 240);
  const avgWait = waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : 0;

  const lines: string[] = [];
  lines.push("Moms Care Flow — Daily Operational Report,Lusaka Central Hospital (Maternity & Pediatric Wing)");
  lines.push(`Generated,${new Date().toISOString()}`);
  lines.push("");
  lines.push("SUMMARY,METRIC");
  lines.push(`Registered Today,${patients.length}`);
  lines.push(`Currently Waiting,${waiting.length}`);
  lines.push(`Attended To (in service),${inService.length}`);
  lines.push(`Visits Completed,${completed.length}`);
  lines.push(`Average Wait Before Service (min),${avgWait}`);
  lines.push(`Total Flow Events,${events}`);
  lines.push("");
  lines.push("STAGE,BREAKDOWN");
  for (const stage of Object.keys(STAGE_META) as Stage[]) {
    lines.push(`${STAGE_META[stage].label},${patients.filter((p) => p.stage === stage).length}`);
  }
  lines.push("");
  lines.push("TICKET,NAME,TYPE,AGE,PRIORITY,STAGE,STATUS,LOUNGE,REGISTERED (CAT),WAITED MIN,VITALS BP,VITALS TEMP,PRESCRIPTION DISPIESED,DWELL MIN");
  for (const p of patients) {
    const bp = p.vitals ? `${p.vitals.systolic}/${p.vitals.diastolic}` : "—";
    const temp = p.vitals?.tempC ?? "—";
    const dwell = p.completedAt ? minutesSince(p.createdAt) : "";
    lines.push([
      p.ticket, p.name, p.visitType, p.age ?? "", p.priority, STAGE_META[p.stage as Stage]?.label ?? p.stage,
      p.status, p.lounge ?? "", p.createdAt.toISOString(), p.status === "WAITING" ? minutesSince(p.stageEnteredAt) : "",
      bp, temp, p.prescription?.dispensed ? "YES" : p.prescription ? "PENDING" : "—", dwell,
    ].map(csvEscape).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="moms-care-flow-daily-report-${stamp}.csv"`,
    },
  });
}
