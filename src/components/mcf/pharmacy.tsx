"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, patchJson, type Patient } from "@/lib/api-client";
import { minutesSince } from "@/lib/queue";
import { StationShell, Panel, PanelHeader, EmptyState, QueueRow } from "./shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function PharmacyView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["patients", "PHARMACY"],
    queryFn: () => api<{ waiting: Patient[]; inService: Patient[] }>("/api/patients?stage=PHARMACY"),
    refetchInterval: 10000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["patients"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["display"] });
  };

  const waiting = data?.waiting ?? [];
  const inService = data?.inService ?? [];

  const act = async (patient: Patient, body: Record<string, unknown>, okTitle: string, okDesc: string) => {
    setBusy(patient.id);
    try {
      await patchJson(`/api/patients/${patient.id}`, body);
      toast({ title: okTitle, description: okDesc });
      refresh();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const parseItems = (json?: string): Array<{ drug: string; dose: string; freq: string; duration: string }> => {
    try {
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  };

  return (
    <div>
      <StationShell
        icon="prescriptions"
        title="Pharmacy"
        sub="Dispensation & handover advice • Final stage before discharge"
        stats={[
          { label: "Prescriptions queued", value: waiting.length },
          { label: "At windows", value: inService.length, tone: "text-on-surface" },
          {
            label: "Avg visit dwell",
            value: (
              <>
                {[...waiting, ...inService].length
                  ? Math.round(
                      [...waiting, ...inService].reduce((n, p) => n + minutesSince(p.createdAt), 0) /
                        Math.max(1, [...waiting, ...inService].length)
                    )
                  : 0}
                <span className="text-body-sm font-normal text-on-surface-variant ml-0.5">m</span>
              </>
            ),
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <div className="lg:col-span-7 space-y-space-md">
          {/* Windows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {[
              { id: "pharm-1", label: "Dispensing Window 1" },
              { id: "pharm-2", label: "Dispensing Window 2" },
            ].map((w) => {
              const occupant = inService.find((p) => p.roomId === w.id);
              return (
                <Panel key={w.id}>
                  <div className="p-space-md pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container font-label-md text-[11px] flex items-center justify-center font-bold">
                        {w.id.slice(-1)}
                      </span>
                      <p className="font-label-lg text-label-lg text-on-surface font-semibold">{w.label}</p>
                    </div>
                    {occupant ? (
                      <span className="font-label-md text-label-md text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">timer</span>
                        <span suppressHydrationWarning>{minutesSince(occupant.stageEnteredAt)}m</span>
                      </span>
                    ) : (
                      <span className="bg-surface-container text-on-surface-variant font-label-md text-[10px] px-2 py-0.5 rounded-full">Available</span>
                    )}
                  </div>
                  {occupant ? (
                    <div className="px-space-md pb-space-md">
                      <div className="bg-surface-container-low rounded-lg p-2 mb-2">
                        <p className="font-label-lg text-label-lg text-on-surface font-semibold">{occupant.name}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{occupant.ticket}</p>
                      </div>
                      <div className="space-y-1 mb-2">
                        {parseItems(occupant.prescription?.items).map((i, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-body-sm text-on-surface">
                            <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">medication</span>
                            <span>
                              <strong className="font-label-md text-label-md">{i.drug}</strong> — {i.dose}, {i.freq}, {i.duration}
                            </span>
                          </div>
                        ))}
                        {!occupant.prescription && (
                          <p className="font-body-sm text-body-sm text-on-surface-variant">No prescription on file — verify manually.</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        disabled={busy === occupant.id}
                        onClick={() => void act(occupant, { action: "dispense", handedOverBy: "Pharm Tech B. Zimba" }, `${occupant.ticket} discharged`, `Handover complete • Visit marked completed`)}
                        className="w-full bg-primary text-on-primary hover:bg-primary-container rounded-full h-8"
                      >
                        <span className="material-symbols-outlined text-[15px]">task_alt</span>
                        Dispense &amp; Handover
                      </Button>
                    </div>
                  ) : (
                    <div className="px-space-md pb-space-md">
                      <div className="border border-dashed border-outline-variant rounded-lg p-3 text-center">
                        <span className="material-symbols-outlined text-[22px] text-outline-variant">medication_liquid</span>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Call the next prescription</p>
                      </div>
                      {waiting[0] && (
                        <Button
                          size="sm"
                          disabled={busy === waiting[0].id}
                          onClick={() => void act(waiting[0], { action: "callNext", roomId: w.id }, `${waiting[0].ticket} at ${w.label}`, "Counselling on dosage can begin")}
                          className="w-full mt-2 bg-surface-container text-primary hover:bg-surface-container-high rounded-full h-8"
                        >
                          Call {waiting[0].ticket}
                        </Button>
                      )}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>

          <Panel>
            <PanelHeader
              icon="hourglass_top"
              title="Dispensing Queue"
              sub="Prescriptions raised by consultation & review"
              right={
                <span className="bg-surface-container text-primary font-label-md text-label-md px-2.5 py-0.5 rounded-full">
                  {waiting.length} waiting
                </span>
              }
            />
            <div className="px-space-md pb-space-md divide-y divide-surface-container max-h-80 overflow-y-auto thin-scroll">
              {isLoading && <EmptyState icon="progress_activity" label="Loading…" />}
              {!isLoading && waiting.length === 0 && <EmptyState icon="event_available" label="No prescriptions waiting." />}
              {waiting.map((p) => (
                <QueueRow key={p.id} patient={p}>
                  <Button
                    size="sm"
                    disabled={busy === p.id}
                    onClick={() => void act(p, { action: "callNext", roomId: inService.some((x) => x.roomId === "pharm-1") ? "pharm-2" : "pharm-1" }, `${p.ticket} called`, `${p.name} to the dispensing window`)}
                    className="h-7 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md"
                  >
                    Call
                  </Button>
                </QueueRow>
              ))}
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <Panel>
            <PanelHeader icon="inbox" title="Recently Discharged" sub="Handover confirmed within the last visits" />
            <div className="px-space-md pb-space-md space-y-2 max-h-96 overflow-y-auto thin-scroll">
              <DischargedList />
            </div>
          </Panel>
          <Panel>
            <PanelHeader icon="volunteer_activism" title="Handover Advice Script" sub="Standard counselling prompts" />
            <div className="px-space-md pb-space-md space-y-1.5 text-body-sm text-on-surface-variant">
              <p>• Iron supplements — take with vitamin C, avoid tea within 1 hour.</p>
              <p>• Folic acid — continue daily through the pregnancy.</p>
              <p>• Return immediately if bleeding, severe headache or reduced fetal movement.</p>
              <p>• Next ANC visit scheduled before leaving — check the appointment slip.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DischargedList() {
  const { data } = useQuery({
    queryKey: ["patients-today-pharmacy"],
    queryFn: () => api<{ patients: Patient[] }>("/api/patients?scope=today"),
    refetchInterval: 15000,
  });
  const discharged = (data?.patients ?? []).filter((p) => p.status === "COMPLETED").slice(0, 8);
  if (discharged.length === 0) return <EmptyState icon="task_alt" label="No discharges yet today." />;
  return (
    <>
      {discharged.map((p) => (
        <div key={p.id} className="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2">
          <div className="min-w-0">
            <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">
              {p.ticket} — {p.name}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Dwell {Math.round((new Date(p.completedAt ?? p.createdAt).getTime() - new Date(p.createdAt).getTime()) / 60000)}m • {p.prescription?.dispensed ? "Prescription dispensed" : "Advice-only"}
            </p>
          </div>
          <span className="material-symbols-outlined text-primary text-[18px]">task_alt</span>
        </div>
      ))}
    </>
  );
}
