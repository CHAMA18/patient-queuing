"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, patchJson, type Patient } from "@/lib/api-client";
import { minutesSince } from "@/lib/queue";
import { StationShell, Panel, PanelHeader, EmptyState, QueueRow, WaitPill } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export function LaboratoryView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["patients", "LAB"],
    queryFn: () => api<{ waiting: Patient[]; inService: Patient[] }>("/api/patients?stage=LAB"),
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

  const pendingCount = waiting.reduce((n, p) => n + p.labTests.filter((t) => t.status === "PENDING").length, 0);

  return (
    <div>
      <StationShell
        icon="chips"
        title="Laboratory Diagnostic"
        sub="Rapid bloods & urinalysis • Results auto-recall to Room 01"
        stats={[
          { label: "Specimens queued", value: waiting.length },
          { label: "At bench", value: inService.length, tone: "text-on-surface" },
          { label: "Tests pending", value: pendingCount, tone: pendingCount >= 6 ? "text-tertiary" : "text-primary" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <div className="lg:col-span-7 space-y-space-md">
          {/* Benches */}
          <Panel>
            <PanelHeader icon="biotech" title="Processing Bench" sub="Samples currently with technicians (Bay 1 • Bay 2 / Centrifuge)" />
            <div className="px-space-md pb-space-md grid grid-cols-1 md:grid-cols-2 gap-space-sm">
              {inService.length === 0 && <EmptyState icon="flask" label="No samples at the bench — pull from the queue." />}
              {inService.map((p, idx) => (
                <div key={p.id} className="bg-surface-container-low rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{p.name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {p.ticket} • running {minutesSince(p.stageEnteredAt)}m
                      </p>
                    </div>
                    <span className={`font-label-md text-[10px] px-2 py-0.5 rounded-full uppercase ${p.labTests.some((t) => t.status === "READY") ? "bg-primary-container text-on-primary-container" : "bg-secondary-container text-on-secondary-container"}`}>
                      {p.labTests.some((t) => t.status === "READY") ? "Ready" : "Processing"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.labTests.map((t) => (
                      <span key={t.id} className="bg-surface-container-lowest text-on-surface-variant font-label-md text-[10px] px-2 py-0.5 rounded-full">
                        {t.panel}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Input
                      placeholder="Result summary e.g. Normal ranges"
                      className="h-8 bg-surface-container-lowest border-outline-variant text-body-sm"
                      value={results[p.id] ?? ""}
                      onChange={(e) => setResults((s) => ({ ...s, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={busy === p.id}
                      onClick={() => void act(p, { action: "labProcess", resultSummary: results[p.id] || "Normal ranges" }, "Results released", `${p.ticket} recalled to Consultation Room 01`)}
                      className="h-8 rounded-full bg-primary text-on-primary hover:bg-primary-container whitespace-nowrap"
                    >
                      Release &amp; Recall
                    </Button>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">place</span> Bench {idx % 2 === 0 ? "1" : "2"}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          {/* Waiting specimens */}
          <Panel>
            <PanelHeader
              icon="hourglass_top"
              title="Specimen Queue"
              sub="Ordered panels awaiting collection & processing"
              right={
                <span className="bg-surface-container text-primary font-label-md text-label-md px-2.5 py-0.5 rounded-full">
                  {waiting.length} waiting
                </span>
              }
            />
            <div className="px-space-md pb-space-md divide-y divide-surface-container max-h-96 overflow-y-auto thin-scroll">
              {isLoading && <EmptyState icon="progress_activity" label="Loading…" />}
              {!isLoading && waiting.length === 0 && <EmptyState icon="event_available" label="No specimens waiting." />}
              {waiting.map((p) => (
                <QueueRow key={p.id} patient={p}>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {p.labTests.slice(0, 2).map((t) => (
                        <span key={t.id} className="bg-surface-container text-on-surface-variant font-label-md text-[10px] px-2 py-0.5 rounded-full">
                          {t.panel}
                        </span>
                      ))}
                      {p.labTests.length > 2 && (
                        <span className="bg-surface-container text-on-surface-variant font-label-md text-[10px] px-2 py-0.5 rounded-full">
                          +{p.labTests.length - 2}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={busy === p.id}
                      onClick={() => void act(p, { action: "callNext", roomId: p.labTests.length > 1 ? "lab-1" : "lab-2" }, `${p.ticket} at bench`, `${p.name} pulled to processing bench`)}
                      className="h-7 rounded-full bg-surface-container text-primary hover:bg-surface-container-high font-label-md text-label-md"
                    >
                      Pull to bench
                    </Button>
                  </div>
                </QueueRow>
              ))}
            </div>
          </Panel>
        </div>

        {/* Right rail */}
        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <Panel className="overflow-hidden">
            <div className="bg-tertiary-fixed/60 p-space-md flex items-start gap-2">
              <span className="material-symbols-outlined text-on-tertiary-fixed text-[20px]">chips</span>
              <div>
                <p className="font-label-lg text-label-lg text-on-tertiary-fixed font-semibold">Centrifuge 02 — Calibration</p>
                <p className="font-body-sm text-body-sm text-on-tertiary-fixed">
                  Single-channel processing while Unit 02 completes its thermal diagnostic cycle. Route overflow to the Satellite Lab from the Command Centre if the queue grows.
                </p>
              </div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader icon="fact_check" title="Turnaround Watchlist" sub="Longest waits at the lab right now" />
            <div className="px-space-md pb-space-md divide-y divide-surface-container">
              {waiting.slice(0, 5).map((p) => (
                <div key={p.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface truncate">{p.ticket} — {p.name}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{p.labTests[0]?.panel ?? "Panel pending"}</p>
                  </div>
                  <WaitPill from={p.stageEnteredAt} />
                </div>
              ))}
              {waiting.length === 0 && <EmptyState icon="verified" label="Lab queue is clear." />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
