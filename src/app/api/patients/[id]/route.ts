import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { broadcast } from "@/lib/bus";
import { minutesSince } from "@/lib/queue";

export const dynamic = "force-dynamic";

// Least-busy room helper (fewest WAITING patients assigned)
async function leastBusyRoom(prefix: string, fallback: string): Promise<string> {
  const waiting = await db.patient.findMany({
    where: { status: "WAITING", roomId: { startsWith: prefix } },
    select: { roomId: true },
  });
  const counts: Record<string, number> = {};
  for (const w of waiting) if (w.roomId) counts[w.roomId] = (counts[w.roomId] ?? 0) + 1;
  let best = fallback;
  let bestCount = Infinity;
  for (let i = 1; i <= (prefix === "consult-" ? 5 : 3); i++) {
    const id = `${prefix}${String(i).padStart(2, "0")}`;
    const c = counts[id] ?? 0;
    if (c < bestCount) {
      bestCount = c;
      best = id;
    }
  }
  return best;
}

// PATCH /api/patients/[id] — station workflow transitions
// actions: callNext | completeVitals | startConsult | endConsult | labProcess | reviewDone | dispense | setPriority
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureSeed();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const patient = await db.patient.findUnique({
    where: { id },
    include: { vitals: true, prescription: true, labTests: true },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const now = new Date();
  const ev = (type: string, title: string, detail?: string, meta?: Record<string, unknown>) =>
    db.event.create({
      data: {
        patientId: patient.id, ticket: patient.ticket, type, title,
        detail: detail ?? null, meta: meta ? JSON.stringify(meta) : null,
      },
    });

  try {
    switch (action) {
      // ---------- VITALS STATION ----------
      case "callNext": {
        const roomId = body.roomId ?? patient.roomId ?? null;
        const updated = await db.patient.update({
          where: { id },
          data: { status: "IN_SERVICE", roomId, stageEnteredAt: now },
        });
        await ev("CALL", `Now Serving — ${patient.ticket}`, `${patient.name} called forward${roomId ? ` to ${roomId}` : ""}`);
        await broadcast("queue:update", { ticket: patient.ticket, stage: patient.stage });
        return NextResponse.json({ patient: updated });
      }

      case "completeVitals": {
        const v = body.vitals ?? {};
        const systolic = Math.round(Number(v.systolic ?? 0));
        const diastolic = Math.round(Number(v.diastolic ?? 0));
        const tempC = v.tempC !== undefined && v.tempC !== "" ? Number(v.tempC) : null;
        const flagged = systolic >= 160 || diastolic >= 100 || (tempC !== null && tempC >= 38.5);

        await db.vitals.upsert({
          where: { patientId: id },
          create: {
            patientId: id,
            systolic: systolic || 120,
            diastolic: diastolic || 80,
            weightKg: v.weightKg ? Number(v.weightKg) : null,
            tempC,
            pulseBpm: v.pulseBpm ? Math.round(Number(v.pulseBpm)) : null,
            fetalBpm: v.fetalBpm ? Math.round(Number(v.fetalBpm)) : null,
            notes: v.notes ?? null,
            flagged,
            recordedBy: body.recordedBy ?? "Nurse P. Tembo",
          },
          update: {
            systolic: systolic || 120, diastolic: diastolic || 80,
            weightKg: v.weightKg ? Number(v.weightKg) : null,
            tempC, pulseBpm: v.pulseBpm ? Math.round(Number(v.pulseBpm)) : null,
            fetalBpm: v.fetalBpm ? Math.round(Number(v.fetalBpm)) : null,
            notes: v.notes ?? null, flagged,
            recordedBy: body.recordedBy ?? "Nurse P. Tembo",
          },
        });

        const room = patient.priority === "RED" || flagged
          ? "consult-01"
          : await leastBusyRoom("consult-", "consult-01");

        const waitedMin = minutesSince(patient.stageEnteredAt);
        const updated = await db.patient.update({
          where: { id },
          data: {
            stage: "CONSULTATION",
            status: "WAITING",
            roomId: room,
            stageEnteredAt: now,
            priority: flagged || patient.priority === "RED" ? "RED" : patient.priority,
            lounge: null,
          },
        });

        await ev(
          flagged ? "ALERT" : "VITALS_DONE",
          flagged
            ? `Urgent Triage Alert: ${patient.name} Priority Flag`
            : `Vitals Completed → Room ${room.slice(-2)}`,
          flagged
            ? `Flagged vitals (${systolic}/${diastolic}${tempC && tempC >= 38.5 ? `, temp ${tempC}°C` : ""}) — expedited consultation pathway required.`
            : `Vitals recorded (${systolic}/${diastolic}) • Routed to Room ${room.slice(-2)} queue`,
          { room, waitedMin, flagged }
        );
        if (flagged) {
          await ev("ALERT", `Triage Red Flag Raised — ${patient.ticket}`, "Auto-flagged by vitals threshold rules (BP ≥ 160/100 or fever ≥ 38.5°C).", { kind: "triage" });
        }
        await broadcast("queue:update", { ticket: patient.ticket, stage: "CONSULTATION" });
        return NextResponse.json({ patient: updated, flagged });
      }

      // ---------- CONSULTATION ----------
      case "startConsult": {
        const updated = await db.patient.update({
          where: { id },
          data: { status: "IN_SERVICE", stageEnteredAt: now, roomId: body.roomId ?? patient.roomId },
        });
        await ev("CONSULT_START", `Consultation Started — ${body.roomLabel ?? patient.roomId ?? "Consultation"}`, `Session opened for ${patient.ticket} (${patient.name})`);
        await broadcast("queue:update", { ticket: patient.ticket, stage: "CONSULTATION" });
        return NextResponse.json({ patient: updated });
      }

      case "endConsult": {
        const outcome = body.outcome as "prescribe" | "order-labs" | "complete";
        const items = Array.isArray(body.items) ? body.items : [];
        const notes = body.notes ?? null;

        if (outcome === "order-labs") {
          const panels: string[] = body.panels?.length ? body.panels : ["Complete Haemogram"];
          for (const panel of panels) {
            await db.labTest.create({
              data: { patientId: id, panel, status: "PENDING", orderedBy: body.doctor ?? "Doctor" },
            });
          }
          const updated = await db.patient.update({
            where: { id },
            data: { stage: "LAB", status: "WAITING", roomId: null, stageEnteredAt: now },
          });
          await ev("LAB_ORDER", `Lab Ordered → Specimen Queue`, `${panels.join(", ")} requested for ${patient.ticket}`, { panels });
          await broadcast("queue:update", { ticket: patient.ticket, stage: "LAB" });
          return NextResponse.json({ patient: updated });
        }

        if (outcome === "prescribe") {
          await db.prescription.upsert({
            where: { patientId: id },
            create: { patientId: id, items: JSON.stringify(items.length ? items : [{ drug: "Iron Supplements (Ferrous Sulphate)", dose: "200mg", freq: "1x daily", duration: "30 days" }]), notes, prescribedBy: body.doctor ?? "Doctor", dispensed: false },
            update: { items: JSON.stringify(items.length ? items : [{ drug: "Iron Supplements (Ferrous Sulphate)", dose: "200mg", freq: "1x daily", duration: "30 days" }]), notes, prescribedBy: body.doctor ?? "Doctor", dispensed: false },
          });
          const updated = await db.patient.update({
            where: { id },
            data: { stage: "PHARMACY", status: "WAITING", roomId: null, stageEnteredAt: now, lounge: patient.lounge ?? "Lounge A" },
          });
          await ev("CONSULT_END", `Consultation Completed → Pharmacy`, `Prescription raised for ${patient.ticket} • Routed to dispensing queue`, { items });
          await broadcast("queue:update", { ticket: patient.ticket, stage: "PHARMACY" });
          return NextResponse.json({ patient: updated });
        }

        // outcome === "complete" (advice only, no meds)
        const dwell = minutesSince(patient.createdAt);
        const updated = await db.patient.update({
          where: { id },
          data: { stage: "COMPLETED", status: "COMPLETED", completedAt: now, stageEnteredAt: now },
        });
        await ev("COMPLETED", "Visit Completed", `Advice-only discharge • Total dwell ${dwell}m`, { dwell });
        await broadcast("queue:update", { ticket: patient.ticket, stage: "COMPLETED" });
        return NextResponse.json({ patient: updated });
      }

      // ---------- LABORATORY ----------
      case "labProcess": {
        const result = body.resultSummary ?? "Normal ranges";
        await db.labTest.updateMany({
          where: { patientId: id, status: { in: ["PENDING", "PROCESSING"] } },
          data: { status: "READY", resultSummary: result, completedAt: now },
        });
        const updated = await db.patient.update({
          where: { id },
          data: { stage: "REVIEW", status: "WAITING", roomId: "consult-01", stageEnteredAt: now },
        });
        await ev("LAB_READY", "Lab Results Ready → Recalled", `Automated return routing to Consultation Room 01 • ${patient.labTests[0]?.panel ?? "Panel"} uploaded`, { tag: "Return Case", extra: "SMS Alert Triggered" });
        await broadcast("queue:update", { ticket: patient.ticket, stage: "REVIEW" });
        return NextResponse.json({ patient: updated });
      }

      // ---------- REVIEW (return cases) ----------
      case "reviewDone": {
        const items = Array.isArray(body.items) ? body.items : [];
        await db.prescription.upsert({
          where: { patientId: id },
          create: { patientId: id, items: JSON.stringify(items.length ? items : [{ drug: "Iron Supplements (Ferrous Sulphate)", dose: "200mg", freq: "1x daily", duration: "30 days" }]), notes: body.notes ?? "Review outcome", prescribedBy: body.doctor ?? "Dr. H. Sinkala", dispensed: false },
          update: { items: JSON.stringify(items.length ? items : [{ drug: "Iron Supplements (Ferrous Sulphate)", dose: "200mg", freq: "1x daily", duration: "30 days" }]), notes: body.notes ?? "Review outcome", prescribedBy: body.doctor ?? "Dr. H. Sinkala", dispensed: false },
        });
        const updated = await db.patient.update({
          where: { id },
          data: { stage: "PHARMACY", status: "WAITING", roomId: null, stageEnteredAt: now },
        });
        await ev("MOVE", "Review Completed → Pharmacy", `Return case ${patient.ticket} closed with prescription • Routed to dispensing queue`);
        await broadcast("queue:update", { ticket: patient.ticket, stage: "PHARMACY" });
        return NextResponse.json({ patient: updated });
      }

      // ---------- PHARMACY ----------
      case "dispense": {
        const dwell = minutesSince(patient.createdAt);
        await db.prescription.updateMany({
          where: { patientId: id },
          data: { dispensed: true, dispensedAt: now, handedOverBy: body.handedOverBy ?? "Pharm Tech B. Zimba" },
        });
        const updated = await db.patient.update({
          where: { id },
          data: { stage: "COMPLETED", status: "COMPLETED", completedAt: now, stageEnteredAt: now },
        });
        await ev("DISPENSED", "Prescriptions Dispensed", `Handover Confirmed • Visit Marked Completed`, { tag: "Discharged", extra: `Dwell: ${dwell}m total`, dwell });
        await ev("COMPLETED", "Visit Completed", `Total dwell ${dwell}m • Discharged`, { dwell });
        await broadcast("queue:update", { ticket: patient.ticket, stage: "COMPLETED" });
        return NextResponse.json({ patient: updated });
      }

      case "setPriority": {
        const updated = await db.patient.update({
          where: { id },
          data: { priority: ["ROUTINE", "URGENT", "RED"].includes(body.priority) ? body.priority : "ROUTINE" },
        });
        await ev("ACTION", `Priority Set — ${body.priority}`, `${patient.ticket} marked ${body.priority} by triage lead`);
        await broadcast("queue:update", { ticket: patient.ticket, stage: patient.stage });
        return NextResponse.json({ patient: updated });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("PATCH /api/patients/[id] failed", err);
    return NextResponse.json({ error: "Transition failed" }, { status: 500 });
  }
}
