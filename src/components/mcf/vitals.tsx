"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, patchJson, postJson, type Patient } from "@/lib/api-client";
import { minutesSince } from "@/lib/queue";
import { StationShell, Panel, PanelHeader, EmptyState, QueueRow, PriorityChip, WaitPill } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BAYS = [
  { id: "vitals-1", label: "Vitals Bay 1" },
  { id: "vitals-2", label: "Vitals Bay 2" },
  { id: "vitals-3", label: "Vitals Bay 3" },
];

const EMPTY_VITALS = { systolic: "", diastolic: "", weightKg: "", tempC: "", pulseBpm: "", fetalBpm: "", notes: "" };

export function VitalsView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [vitals, setVitals] = useState<Record<string, typeof EMPTY_VITALS>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["patients", "VITALS"],
    queryFn: () => api<{ waiting: Patient[]; inService: Patient[] }>("/api/patients?stage=VITALS"),
    refetchInterval: 10000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["patients"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["display"] });
  };

  const waiting = data?.waiting ?? [];
  const inService = data?.inService ?? [];

  const flagOf = (v: typeof EMPTY_VITALS) =>
    Number(v.systolic) >= 160 || Number(v.diastolic) >= 100 || Number(v.tempC) >= 38.5;

  const callNext = async (patient: Patient, bayId: string) => {
    setBusy(patient.id);
    try {
      await patchJson(`/api/patients/${patient.id}`, { action: "callNext", roomId: bayId });
      setVitals((v) => ({ ...v, [patient.id]: { ...EMPTY_VITALS } }));
      toast({ title: `${patient.ticket} called forward`, description: `${patient.name} → ${BAYS.find((b) => b.id === bayId)?.label}` });
      refresh();
    } catch (e) {
      toast({ title: "Could not call patient", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const completeVitals = async (patient: Patient) => {
    const v = vitals[patient.id] ?? EMPTY_VITALS;
    if (!v.systolic || !v.diastolic) {
      toast({ title: "Blood pressure required", description: "Enter systolic and diastolic readings before routing.", variant: "destructive" });
      return;
    }
    setBusy(patient.id);
    try {
      const res = await patchJson<{ flagged: boolean }>(`/api/patients/${patient.id}`, {
        action: "completeVitals",
        vitals: v,
        recordedBy: "Nurse P. Tembo",
      });
      toast({
        title: res.flagged ? `Red flag raised — ${patient.ticket} expedited` : `${patient.ticket} routed to consultation`,
        description: res.flagged
          ? "Vitals breached threshold rules (BP ≥ 160/100 or fever ≥ 38.5°C) — routed to Room 01."
          : `Vitals recorded • Added to Room queue`,
      });
      setVitals((s) => ({ ...s, [patient.id]: { ...EMPTY_VITALS } }));
      refresh();
    } catch (e) {
      toast({ title: "Could not save vitals", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const fastTrack = async (patient: Patient) => {
    setBusy(patient.id);
    try {
      await postJson("/api/actions", { action: "fast-track", patientId: patient.id });
      toast({ title: `${patient.ticket} fast-tracked`, description: "Expedited to the front of Room 01 consultation queue." });
      refresh();
    } catch (e) {
      toast({ title: "Fast-track failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <StationShell
        icon="ecg_heart"
        title="Vitals Station"
        sub="BP, weight & fetal doppler triage • Red-flag rules active"
        stats={[
          { label: "Waiting", value: waiting.length },
          { label: "In bays", value: inService.length },
          {
            label: "Red flags",
            value: inService.filter((p) => p.priority === "RED" || p.vitals?.flagged).length,
            tone: "text-tertiary",
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Bays */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-space-md">
            {BAYS.map((bay) => {
              // Prefer the red-flagged patient in her assigned bay so triage alerts stay visible
              const occupant =
                inService.find((p) => p.roomId === bay.id && (p.priority === "RED" || p.vitals?.flagged)) ??
                inService.find((p) => p.roomId === bay.id);
              const flagged = occupant?.vitals?.flagged || occupant?.priority === "RED";
              const v = occupant ? vitals[occupant.id] ?? EMPTY_VITALS : null;
              return (
                <Panel key={bay.id} className={flagged ? "ring-2 ring-error/40" : undefined}>
                  <div className="p-space-md pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-label-md text-[11px] flex items-center justify-center font-bold">
                        {bay.id.slice(-1)}
                      </span>
                      <div>
                        <p className="font-label-lg text-label-lg text-on-surface font-semibold">{bay.label}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {occupant ? `Occupied ${minutesSince(occupant.stageEnteredAt)}m` : "Available"}
                        </p>
                      </div>
                    </div>
                    {occupant?.priority === "RED" && <PriorityChip priority="RED" />}
                  </div>
                  {occupant ? (
                    <div className="px-space-md pb-space-md">
                      <div className={flagged ? "bg-error-container/40 border border-error/30 rounded-lg p-2 mb-2" : "bg-surface-container-low rounded-lg p-2 mb-2"}>
                        <p className="font-label-lg text-label-lg text-on-surface font-semibold">{occupant.name}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {occupant.ticket} • {occupant.visitType}
                        </p>
                        {occupant.vitals && (
                          <p className="font-body-sm text-body-sm mt-1">
                            <span className={flagged ? "text-on-error-container font-semibold" : "text-primary font-semibold"}>
                              {occupant.vitals.systolic}/{occupant.vitals.diastolic} BP
                            </span>
                            {occupant.vitals.tempC !== null && <span className="text-on-surface-variant"> • {occupant.vitals.tempC}°C</span>}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { k: "systolic", ph: "Sys" },
                          { k: "diastolic", ph: "Dia" },
                          { k: "weightKg", ph: "Wt kg" },
                          { k: "tempC", ph: "Temp" },
                          { k: "pulseBpm", ph: "Pulse" },
                          { k: "fetalBpm", ph: "Fetal" },
                        ].map((f) => (
                          <Input
                            key={f.k}
                            placeholder={f.ph}
                            inputMode="decimal"
                            className="h-8 bg-surface-container-lowest border-outline-variant text-body-sm"
                            value={v![f.k as keyof typeof EMPTY_VITALS]}
                            onChange={(e) => setVitals((s) => ({ ...s, [occupant.id]: { ...(s[occupant.id] ?? EMPTY_VITALS), [f.k]: e.target.value } }))}
                          />
                        ))}
                      </div>
                      <Textarea
                        placeholder="Notes (optional)"
                        rows={1}
                        className="mt-1.5 bg-surface-container-lowest border-outline-variant text-body-sm"
                        value={v!.notes}
                        onChange={(e) => setVitals((s) => ({ ...s, [occupant.id]: { ...(s[occupant.id] ?? EMPTY_VITALS), notes: e.target.value } }))}
                      />
                      {v && flagOf(v) && (
                        <div className="mt-1.5 flex items-center gap-1 bg-error-container text-on-error-container font-label-md text-label-md px-2 py-1 rounded-lg">
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          Threshold breach — auto Priority Red on routing
                        </div>
                      )}
                      <div className="flex gap-1.5 mt-2">
                        <Button
                          size="sm"
                          disabled={busy === occupant.id}
                          onClick={() => void completeVitals(occupant)}
                          className="flex-1 bg-primary text-on-primary hover:bg-primary-container rounded-full h-8"
                        >
                          <span className="material-symbols-outlined text-[15px]">check_circle</span>
                          Complete &amp; Route
                        </Button>
                        {flagged && (
                          <Button
                            size="sm"
                            disabled={busy === occupant.id}
                            onClick={() => void fastTrack(occupant)}
                            className="flex-1 bg-tertiary text-on-tertiary hover:bg-tertiary-container rounded-full h-8"
                          >
                            <span className="material-symbols-outlined text-[15px]">bolt</span>
                            Fast Track Rm 01
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="px-space-md pb-space-md">
                      <div className="border border-dashed border-outline-variant rounded-lg p-3 text-center">
                        <span className="material-symbols-outlined text-[22px] text-outline-variant">event_seat</span>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Call the next mother from the queue</p>
                      </div>
                      {waiting[0] && (
                        <Button
                          size="sm"
                          disabled={busy === waiting[0].id}
                          onClick={() => void callNext(waiting[0], bay.id)}
                          className="w-full mt-2 bg-surface-container text-primary hover:bg-surface-container-high rounded-full h-8"
                        >
                          <span className="material-symbols-outlined text-[15px]">notifications_active</span>
                          Call {waiting[0].ticket}
                        </Button>
                      )}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>

          {inService.filter((p) => !BAYS.some((b) => b.id === p.roomId)).length > 0 && (
            <Panel>
              <PanelHeader icon="group" title="Overflow checks in progress" sub="Mothers being seen outside assigned bays" />
              <div className="px-space-md pb-space-md divide-y divide-surface-container">
                {inService
                  .filter((p) => !BAYS.some((b) => b.id === p.roomId))
                  .map((p) => (
                    <QueueRow
                      key={p.id}
                      patient={p}
                      onClick={() => void callNext(p, BAYS[0].id)}
                    >
                      <Button size="sm" variant="outline" className="h-7 rounded-full border-outline-variant text-primary">
                        Route →
                      </Button>
                    </QueueRow>
                  ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Waiting queue */}
        <Panel className="lg:col-span-5 h-fit">
          <PanelHeader
            icon="chair"
            title="Triage Queue"
            sub="FIFO with priority override"
            right={
              <span className="bg-surface-container text-primary font-label-md text-label-md px-2.5 py-0.5 rounded-full">
                {waiting.length} waiting
              </span>
            }
          />
          <div className="px-space-md pb-space-md divide-y divide-surface-container max-h-[560px] overflow-y-auto thin-scroll">
            {isLoading && <EmptyState icon="progress_activity" label="Loading queue…" />}
            {!isLoading && waiting.length === 0 && <EmptyState icon="event_available" label="Triage queue is clear." />}
            {waiting.map((p) => (
              <QueueRow key={p.id} patient={p}>
                <Button
                  size="sm"
                  disabled={busy === p.id}
                  onClick={() => void callNext(p, BAYS.find((b) => !inService.some((x) => x.roomId === b.id))?.id ?? "vitals-1")}
                  className="h-7 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md"
                >
                  Call
                </Button>
              </QueueRow>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
