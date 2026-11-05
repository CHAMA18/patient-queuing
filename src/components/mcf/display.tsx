"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type DisplayData } from "@/lib/api-client";
import { catClock, catDateLong } from "@/lib/cat";
import { useNow, useQueueSocket } from "@/hooks/use-queue-socket";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ChitengeBar, LogoMark } from "./shared";
import { Button } from "@/components/ui/button";

export function DisplayView({ onExit }: { onExit: () => void }) {
  const now = useNow(1000);
  const queryClient = useQueryClient();
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["display"] });
  }, [queryClient]);
  useQueueSocket(refresh);

  const { data } = useQuery({
    queryKey: ["display"],
    queryFn: () => api<DisplayData>("/api/display"),
    refetchInterval: 10000,
  });

  const serving = data?.nowServing ?? [];
  const rooms = serving.filter((s) => s.room.startsWith("consult-") || s.room === "sono-1");
  const stations = serving.filter((s) => !s.room.startsWith("consult-") && s.room !== "sono-1");
  const queueOrder = ["VITALS", "CONSULTATION", "LAB", "REVIEW", "PHARMACY"] as const;

  return (
    <div className="min-h-screen bg-inverse-surface text-inverse-on-surface flex flex-col">
      {/* Top bar */}
      <div className="px-6 lg:px-10 pt-4 pb-2">
        <ChitengeBar className="mb-4" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LogoMark className="h-11 w-11" />
            <div>
              <p className="font-headline-md text-headline-md font-semibold tracking-tight">
                {data?.settings.hospitalName ?? "Lusaka Central Hospital"} — {data?.settings.wing ?? "Maternity & Pediatric Wing"}
              </p>
              <p className="font-body-md text-body-md text-inverse-primary">Please wait to be called • Antenatal, Paediatric &amp; Postnatal stream</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-display-lg-mobile text-display-lg-mobile font-bold text-inverse-primary leading-none" suppressHydrationWarning>
                {now ? catClock(now) : ""}
              </p>
              <p className="font-body-sm text-body-sm text-inverse-primary/80" suppressHydrationWarning>
                {now ? catDateLong(now) : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onExit}
              className="rounded-full border-inverse-primary/40 text-inverse-primary hover:bg-inverse-primary/10"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              Exit TV Mode
            </Button>
          </div>
        </div>
      </div>

      {/* Now serving boards */}
      <div className="flex-1 px-6 lg:px-10 py-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
        {rooms.map((s) => (
          <div key={`${s.room}-${s.ticket}`} className="rounded-2xl bg-inverse-primary/10 border border-inverse-primary/20 p-5 flex flex-col gap-1">
            <p className="font-label-lg text-label-lg text-inverse-primary/80 uppercase tracking-wider">{s.label}</p>
            <p className="font-display-lg-mobile text-display-lg-mobile font-bold text-inverse-primary leading-tight">{s.ticket}</p>
            <p className="font-title-md text-title-md text-inverse-on-surface/90 truncate">{s.name}</p>
            <p className="font-body-sm text-body-sm text-inverse-primary/70 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">stethoscope</span>
              In consultation
            </p>
          </div>
        ))}
        {stations.map((s) => (
          <div key={`${s.room}-${s.ticket}`} className="rounded-2xl bg-surface-container/10 border border-surface-container/25 p-5 flex flex-col gap-1">
            <p className="font-label-lg text-label-lg text-inverse-primary/80 uppercase tracking-wider">{s.label}</p>
            <p className="font-display-lg-mobile text-display-lg-mobile font-bold text-inverse-primary leading-tight">{s.ticket}</p>
            <p className="font-title-md text-title-md text-inverse-on-surface/90 truncate">{s.name}</p>
            <p className="font-body-sm text-body-sm text-inverse-primary/70 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">
                {s.stage === "VITALS" ? "ecg_heart" : s.stage === "LAB" ? "chips" : s.stage === "PHARMACY" ? "prescriptions" : "schedule"}
              </span>
              {s.stage === "VITALS" ? "Vitals check" : s.stage === "LAB" ? "Lab test" : s.stage === "PHARMACY" ? "Dispensing" : "Review"}
            </p>
          </div>
        ))}
        {serving.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-inverse-primary/30 p-10 text-center">
            <span className="material-symbols-outlined text-[40px] text-inverse-primary/60">connected_tv</span>
            <p className="font-headline-sm text-headline-sm text-inverse-primary/80 mt-2">No active calls — next tickets will appear here automatically.</p>
          </div>
        )}

        {/* Up next strips */}
        <div className="col-span-full grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 pt-2">
          {queueOrder.map((stage) => {
            const q = data?.queues[stage];
            return (
              <div key={stage} className="rounded-2xl bg-surface-container/10 border border-surface-container/25 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-label-lg text-label-lg text-inverse-primary/90 truncate">{q?.label ?? stage}</p>
                  <span className="bg-inverse-primary/20 text-inverse-primary font-label-md text-label-md px-2 py-0.5 rounded-full">
                    {q?.waiting ?? 0}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(q?.next ?? []).slice(0, 4).map((t, i) => (
                    <span
                      key={t}
                      className={`font-label-md text-label-md px-2.5 py-1 rounded-full ${
                        i === 0 ? "bg-inverse-primary text-inverse-surface font-bold" : "bg-surface-container/15 text-inverse-on-surface/80"
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                  {(q?.next?.length ?? 0) === 0 && (
                    <span className="font-body-sm text-body-sm text-inverse-primary/60">Queue clear</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer ticker */}
      <div className="px-6 lg:px-10 py-3 border-t border-inverse-primary/20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-inverse-primary text-[20px]">campaign</span>
          <p className="font-body-md text-body-md text-inverse-on-surface/80 truncate">
            Kindly keep your ticket number visible. Mothers with Priority Red are served first. Fetal Doppler triage target is fully met today.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-label-md text-label-md text-inverse-primary/80 hidden sm:inline">
            Ward occupancy {data?.settings.wardOccupancyPct ?? "74"}%
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-inverse-primary animate-pulse" />
          <span className="font-label-md text-label-md text-inverse-primary">LIVE</span>
        </div>
      </div>
    </div>
  );
}
