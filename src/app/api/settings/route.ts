import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed, ensureSeedRaw } from "@/lib/seed";
import { broadcast } from "@/lib/bus";

export const dynamic = "force-dynamic";

// GET /api/settings — settings map + staff roster
export async function GET() {
  await ensureSeed();
  const [settingsRaw, staff] = await Promise.all([
    db.setting.findMany(),
    db.staff.findMany({ orderBy: [{ station: "asc" }, { name: "asc" }] }),
  ]);
  return NextResponse.json({
    settings: Object.fromEntries(settingsRaw.map((s) => [s.key, s.value])),
    staff,
  });
}

// PATCH /api/settings — update setting values and/or staff roster
export async function PATCH(req: NextRequest) {
  await ensureSeed();
  const body = await req.json().catch(() => ({}));

  if (body.values && typeof body.values === "object") {
    for (const [key, value] of Object.entries(body.values)) {
      await db.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }
  }

  if (Array.isArray(body.staff)) {
    for (const st of body.staff) {
      if (st.id) {
        await db.staff.update({
          where: { id: st.id },
          data: {
            ...(st.active !== undefined ? { active: Boolean(st.active) } : {}),
            ...(st.room !== undefined ? { room: st.room } : {}),
          },
        });
      }
    }
  }

  if (body.newStaff?.name && body.newStaff?.role) {
    await db.staff.create({
      data: {
        name: String(body.newStaff.name),
        role: String(body.newStaff.role),
        station: String(body.newStaff.station ?? "CONSULTATION"),
        room: body.newStaff.room ?? null,
        active: true,
      },
    });
  }

  await broadcast("queue:update", {});
  const [settingsRaw, staff] = await Promise.all([
    db.setting.findMany(),
    db.staff.findMany({ orderBy: [{ station: "asc" }, { name: "asc" }] }),
  ]);
  return NextResponse.json({
    settings: Object.fromEntries(settingsRaw.map((s) => [s.key, s.value])),
    staff,
  });
}

// POST /api/settings — demo reset (wipes data and reseeds the demo day)
export async function POST() {
  await db.event.deleteMany();
  await db.labTest.deleteMany();
  await db.prescription.deleteMany();
  await db.vitals.deleteMany();
  await db.patient.deleteMany();
  await db.staff.deleteMany();
  await db.setting.deleteMany();
  await ensureSeedRaw();
  await broadcast("queue:update", { reset: true });
  return NextResponse.json({ ok: true });
}
