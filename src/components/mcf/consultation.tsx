"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, patchJson, type Patient } from "@/lib/api-client";
import { minutesSince } from "@/lib/queue";
import { StationShell, Panel, PanelHeader, EmptyState, QueueRow } from "./shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const ROOMS = [
  { id: "consult-01", label: "Room 01", doctor: "Dr. F. Phiri" },
  { id: "consult-02", label: "Room 02", doctor: "Dr. K. Mwape" },
  { id: "consult-03", label: "Room 03", doctor: "Dr. J. Banda" },
  { id: "consult-04", label: "Room 04", doctor: "Dr. C. Zulu" },
  { id: "consult-05", label: "Room 05", doctor: "Dr. A. Mwale" },
  { id: "sono-1", label: "Sonography Bay", doctor: "Sonographer C. Mwila" },
];

const PANELS = ["Complete Haemogram", "Urinalysis", "Blood Group & Rhesus", "Malaria RDT", "Random Blood Sugar", "Hb Level"];
const DRUGS = [
  { drug: "Iron Supplements (Ferrous Sulphate)", dose: "200mg", freq: "1x daily", duration: "30 days" },
  { drug: "Folic Acid", dose: "5mg", freq: "1x daily", duration: "30 days" },
  { drug: "Calcium Lactate", dose: "600mg", freq: "2x daily", duration: "21 days" },
  { drug: "Paracetamol", dose: "500mg", freq: "3x daily", duration: "5 days" },
];

export function ConsultationView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [labPatient, setLabPatient] = useState<Patient | null>(null);
  const [labPanels, setLabPanels] = useState<string[]>(["Complete Haemogram"]);
  const [rxPatient, setRxPatient] = useState<Patient | null>(null);
  const [rxDrugs, setRxDrugs] = useState<number[]>([0, 1]);
  const [rxNotes, setRxNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["patients", "CONSULTATION"],
    queryFn: () => api<{ waiting: Patient[]; inService: Patient[] }>("/api/patients?stage=CONSULTATION"),
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

  const callNext = (room: { id: string; label: string }) => {
    const next = waiting.find((p) => p.roomId === room.id) ?? waiting.find((p) => !p.roomId) ?? waiting[0];
    if (!next) {
      toast({ title: "Queue empty", description: "No mothers waiting for consultation." });
      return;
    }
    void act(next, { action: "startConsult", roomId: room.id, roomLabel: room.label }, `${next.ticket} now in ${room.label}`, `Session opened with ${next.name}`);
  };

  const overflow = waiting.filter((p) => p.roomId === "consult-06");
  const unassigned = waiting.filter((p) => p.roomId === null);

  return (
    <div>
      <StationShell
        icon="stethoscope"
        title="Consultation Rooms"
        sub="Rooms 01–05 • Sonography bay • Session timers & outcomes"
        stats={[
          { label: "Waiting", value: waiting.length },
          { label: "In session", value: inService.length },
          {
            label: "Overruns",
            value: inService.filter((p) => minutesSince(p.stageEnteredAt) > 24).length,
            tone: "text-tertiary",
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md mb-space-lg">
        {ROOMS.map((room) => {
          const current = inService.find((p) => p.roomId === room.id);
          const roomQueue = waiting.filter((p) => p.roomId === room.id);
          const over = current ? minutesSince(current.stageEnteredAt) > 24 : false;
          return (
            <Panel key={room.id} className={over ? "ring-2 ring-tertiary/50" : undefined}>
              <div className="p-space-md pb-2 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary-container text-on-primary-container font-label-md text-[12px] flex items-center justify-center font-bold">
                    {room.label.slice(-2)}
                  </span>
                  <div>
                    <p className="font-label-lg text-label-lg text-on-surface font-semibold">{room.label}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{room.doctor}</p>
                  </div>
                </div>
                {roomQueue.length > 0 && (
                  <span className="bg-surface-container text-primary font-label-md text-label-md px-2 py-0.5 rounded-full">
                    {roomQueue.length} queued
                  </span>
                )}
              </div>

              {current ? (
                <div className="px-space-md pb-space-md">
                  <div className={over ? "bg-tertiary-fixed/50 border border-tertiary/30 rounded-lg p-2" : "bg-surface-container-low rounded-lg p-2"}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{current.name}</p>
                      <span className={over ? "text-on-tertiary-fixed font-label-md text-label-md flex items-center gap-1" : "text-primary font-label-md text-label-md flex items-center gap-1"}>
                        <span className="material-symbols-outlined text-[14px]">timer</span>
                        <span suppressHydrationWarning>{minutesSince(current.stageEnteredAt)}m</span>
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {current.ticket} • {current.visitType}{current.gestationWk ? ` (${current.gestationWk}w)` : ""}
                      {current.priority !== "ROUTINE" && ` • ${current.priority}`}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-outline-variant text-primary font-label-md text-[11px]"
                      onClick={() => {
                        setLabPatient(current);
                        setLabPanels(["Complete Haemogram"]);
                      }}
                    >
                      <span className="material-symbols-outlined text-[14px]">chips</span>
                      Lab
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-outline-variant text-primary font-label-md text-[11px]"
                      onClick={() => {
                        setRxPatient(current);
                        setRxDrugs([0, 1]);
                        setRxNotes("");
                      }}
                    >
                      <span className="material-symbols-outlined text-[14px]">prescriptions</span>
                      Rx
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy === current.id}
                      onClick={() =>
                        void act(
                          current,
                          { action: "endConsult", outcome: "complete", doctor: room.doctor },
                          `${current.ticket} completed`,
                          "Advice-only discharge recorded."
                        )
                      }
                      className="h-8 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md text-[11px]"
                    >
                      <span className="material-symbols-outlined text-[14px]">task_alt</span>
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-space-md pb-space-md">
                  <div className="border border-dashed border-outline-variant rounded-lg p-3 text-center">
                    <span className="material-symbols-outlined text-[22px] text-outline-variant">meeting_room</span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">Room idle — call the next mother</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => callNext(room)}
                    className="w-full mt-2 bg-surface-container text-primary hover:bg-surface-container-high rounded-full h-8"
                  >
                    <span className="material-symbols-outlined text-[15px]">notifications_active</span>
                    Call Next
                  </Button>
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <Panel className="lg:col-span-7">
          <PanelHeader
            icon="chair"
            title="Consultation Waiting List"
            sub="Assigned room queues in wait-time order"
            right={
              <span className="bg-surface-container text-primary font-label-md text-label-md px-2.5 py-0.5 rounded-full">
                {waiting.length} waiting
              </span>
            }
          />
          <div className="px-space-md pb-space-md divide-y divide-surface-container max-h-96 overflow-y-auto thin-scroll">
            {isLoading && <EmptyState icon="progress_activity" label="Loading…" />}
            {!isLoading && waiting.length === 0 && <EmptyState icon="event_available" label="No mothers waiting." />}
            {waiting.map((p) => (
              <QueueRow key={p.id} patient={p}>
                {p.roomId && (
                  <span className="bg-surface-container text-primary font-label-md text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap">
                    Room {p.roomId.slice(-2)}
                  </span>
                )}
                <Button
                  size="sm"
                  disabled={busy === p.id}
                  onClick={() => {
                    const room = ROOMS.find((r) => r.id === p.roomId) ?? ROOMS[0];
                    void act(p, { action: "startConsult", roomId: room.id, roomLabel: room.label }, `${p.ticket} now in ${room.label}`, `Session opened with ${p.name}`);
                  }}
                  className="h-7 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md"
                >
                  Seat
                </Button>
              </QueueRow>
            ))}
          </div>
        </Panel>

        <div className="lg:col-span-5 flex flex-col gap-space-md">
          {overflow.length > 0 && (
            <Panel className="ring-2 ring-primary/40">
              <PanelHeader icon="meeting_room" title="Overflow Bay" sub="consult-06 • temporary capacity" />
              <div className="px-space-md pb-space-md divide-y divide-surface-container">
                {overflow.map((p) => (
                  <QueueRow key={p.id} patient={p}>
                    <Button
                      size="sm"
                      onClick={() => void act(p, { action: "startConsult", roomId: "consult-06", roomLabel: "Overflow Bay" }, `${p.ticket} in Overflow Bay`, `Session opened with ${p.name}`)}
                      className="h-7 rounded-full bg-primary-container text-on-primary-container hover:bg-primary font-label-md text-label-md"
                    >
                      Seat
                    </Button>
                  </QueueRow>
                ))}
              </div>
            </Panel>
          )}
          <Panel>
            <PanelHeader icon="rule" title="Clinical Snapshot" sub="Pregnancy & priority summary of in-session mothers" />
            <div className="px-space-md pb-space-md space-y-2">
              {inService.length === 0 && <EmptyState icon="stethoscope" label="No sessions running." />}
              {inService.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">
                      {p.ticket} — {p.name}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {p.roomId ? `Room ${p.roomId.slice(-2)}` : "Bay"} • BP {p.vitals ? `${p.vitals.systolic}/${p.vitals.diastolic}` : "—"}
                      {p.vitals?.fetalBpm ? ` • FHR ${p.vitals.fetalBpm}` : ""}
                    </p>
                  </div>
                  <span className="font-label-md text-label-md text-primary" suppressHydrationWarning>
                    {minutesSince(p.stageEnteredAt)}m
                  </span>
                </div>
              ))}
              {unassigned.length > 0 && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {unassigned.length} patient{unassigned.length > 1 ? "s" : ""} not yet assigned to a room — use the general queue.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Order lab dialog */}
      <Dialog open={!!labPatient} onOpenChange={(o) => !o && setLabPatient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">chips</span>
              Order Lab — {labPatient?.ticket}
            </DialogTitle>
            <DialogDescription>
              Select panels for {labPatient?.name}. Patient will be queued at the Specimen Lab and auto-recalled to Room 01 when results are ready.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {PANELS.map((p) => (
              <label key={p} className="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 cursor-pointer hover:bg-surface-container-low">
                <Checkbox
                  checked={labPanels.includes(p)}
                  onCheckedChange={(c) => setLabPanels((s) => (c ? [...s, p] : s.filter((x) => x !== p)))}
                />
                <span className="font-body-sm text-body-sm text-on-surface">{p}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full border-outline-variant" onClick={() => setLabPatient(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-primary text-on-primary hover:bg-primary-container"
              disabled={labPanels.length === 0 || !labPatient || busy === labPatient.id}
              onClick={() => {
                const p = labPatient!;
                setLabPatient(null);
                void act(p, { action: "endConsult", outcome: "order-labs", panels: labPanels }, "Labs ordered", `${p.ticket} → Specimen Lab queue (${labPanels.length} panel${labPanels.length > 1 ? "s" : ""})`);
              }}
            >
              <span className="material-symbols-outlined text-[16px]">science</span>
              Send to Lab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prescribe dialog */}
      <Dialog open={!!rxPatient} onOpenChange={(o) => !o && setRxPatient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">prescriptions</span>
              Prescribe — {rxPatient?.ticket}
            </DialogTitle>
            <DialogDescription>
              Raise a prescription for {rxPatient?.name}. Patient will be routed to the pharmacy dispensing queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-56 overflow-y-auto thin-scroll pr-1">
            {DRUGS.map((d, i) => (
              <label key={d.drug} className="flex items-start gap-2 rounded-lg border border-outline-variant px-3 py-2 cursor-pointer hover:bg-surface-container-low">
                <Checkbox
                  className="mt-0.5"
                  checked={rxDrugs.includes(i)}
                  onCheckedChange={(c) => setRxDrugs((s) => (c ? [...s, i] : s.filter((x) => x !== i)))}
                />
                <div>
                  <p className="font-label-lg text-label-lg text-on-surface">{d.drug}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {d.dose} • {d.freq} • {d.duration}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <Textarea
            placeholder="Dosage notes / advice (optional)"
            value={rxNotes}
            onChange={(e) => setRxNotes(e.target.value)}
            className="border-outline-variant"
          />
          <DialogFooter>
            <Button variant="outline" className="rounded-full border-outline-variant" onClick={() => setRxPatient(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-primary text-on-primary hover:bg-primary-container"
              disabled={rxDrugs.length === 0 || !rxPatient || busy === rxPatient.id}
              onClick={() => {
                const p = rxPatient!;
                const items = rxDrugs.map((i) => DRUGS[i]);
                setRxPatient(null);
                void act(p, { action: "endConsult", outcome: "prescribe", items, notes: rxNotes || null }, "Prescription raised", `${p.ticket} → Pharmacy queue`);
              }}
            >
              <span className="material-symbols-outlined text-[16px]">send_prescription</span>
              Send to Pharmacy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
