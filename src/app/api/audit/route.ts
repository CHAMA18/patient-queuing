import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

// GET /api/audit?take=150 — full audit trail
export async function GET(req: NextRequest) {
  await ensureSeed();
  const { searchParams } = new URL(req.url);
  const take = Math.min(400, Number(searchParams.get("take") ?? 150));
  const events = await db.event.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { patient: { select: { name: true, stage: true, status: true } } },
  });
  const total = await db.event.count();
  return NextResponse.json({ events, total });
}
