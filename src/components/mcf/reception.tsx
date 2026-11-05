"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, postJson, type Patient } from "@/lib/api-client";
import { catTime } from "@/lib/cat";
import { VISIT_TYPES, VISIT_TYPE_META, LOUNGES } from "@/lib/queue";
import { StationShell, Panel, PanelHeader, EmptyState, QueueRow } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export function ReceptionView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["patients", "REGISTRATION"],
    queryFn: () => api<{ waiting: Patient[]; inService: Patient[] }>("/api/patients?stage=REGISTRATION"),
    refetchInterval: 10000,
  });
  const { data: today } = useQuery({
    queryKey: ["patients-today"],
    queryFn: () => api<{ patients: Patient[] }>("/api/patients?scope=today"),
    refetchInterval: 15000,
  });

  const [form, setForm] = useState({
    name: "",
    age: "",
    phone: "",
    address: "",
    visitType: "ANTENATAL",
    trimester: "First",
    gestationWk: "",
    priority: "ROUTINE",
    lounge: "Lounge A",
  });

  const nextTicket = useMemo(() => {
    const nums = (today?.patients ?? []).map((p) => parseInt(p.ticket.replace(/^MC-/, ""), 10)).filter((n) => !Number.isNaN(n));
    const next = Math.max(0, ...nums) + 1;
    return `MC-${String(next).padStart(3, "0")}`;
  }, [today]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["patients"] });
    queryClient.invalidateQueries({ queryKey: ["patients-today"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Enter the patient's full name to register.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await postJson<{ patient: Patient }>("/api/patients", {
        ...form,
        age: form.age ? Number(form.age) : undefined,
        gestationWk: form.gestationWk ? Number(form.gestationWk) : undefined,
      });
      toast({
        title: `Ticket ${res.patient.ticket} issued`,
        description: `${res.patient.name} registered • ${res.patient.lounge} Seat ${res.patient.seat}`,
      });
      setForm({ ...form, name: "", age: "", phone: "", address: "" });
      refresh();
    } catch (e) {
      toast({ title: "Registration failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const waiting = data?.waiting ?? [];

  return (
    <div>
      <StationShell
        icon="how_to_reg"
        title="OPD Reception"
        sub="Intake & registration desk • Issue queue tickets for the maternity wing"
        stats={[
          { label: "Waiting for intake", value: waiting.length },
          { label: "Registered today", value: today?.patients.length ?? "—", tone: "text-on-surface" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Registration form */}
        <Panel className="lg:col-span-5 h-fit">
          <PanelHeader icon="badge" title="New Mother / Child Intake" sub={`Next ticket: ${nextTicket}`} />
          <div className="p-space-md pt-0 grid grid-cols-2 gap-space-sm">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="reg-name" className="text-on-surface-variant font-label-md">Full name</Label>
              <Input
                id="reg-name"
                placeholder="e.g. Chanda Mwansa"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-surface-container-lowest border-outline-variant"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-age" className="text-on-surface-variant font-label-md">Age</Label>
              <Input id="reg-age" inputMode="numeric" placeholder="24" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, "") })} className="bg-surface-container-lowest border-outline-variant" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-phone" className="text-on-surface-variant font-label-md">Phone</Label>
              <Input id="reg-phone" placeholder="+260 97 …" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-surface-container-lowest border-outline-variant" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="reg-address" className="text-on-surface-variant font-label-md">Address / compound</Label>
              <Input id="reg-address" placeholder="Chilenje, Lusaka" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-surface-container-lowest border-outline-variant" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-on-surface-variant font-label-md">Visit type</Label>
              <Select value={form.visitType} onValueChange={(v) => setForm({ ...form, visitType: v })}>
                <SelectTrigger className="bg-surface-container-lowest border-outline-variant w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {VISIT_TYPE_META[t].label} — {VISIT_TYPE_META[t].hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.visitType === "ANTENATAL" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-on-surface-variant font-label-md">Trimester</Label>
                  <Select value={form.trimester} onValueChange={(v) => setForm({ ...form, trimester: v })}>
                    <SelectTrigger className="bg-surface-container-lowest border-outline-variant w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["First", "Second", "Third"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-gw" className="text-on-surface-variant font-label-md">Gestation (weeks)</Label>
                  <Input id="reg-gw" inputMode="numeric" placeholder="24" value={form.gestationWk} onChange={(e) => setForm({ ...form, gestationWk: e.target.value.replace(/\D/g, "") })} className="bg-surface-container-lowest border-outline-variant" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-on-surface-variant font-label-md">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="bg-surface-container-lowest border-outline-variant w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUTINE">Routine</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="RED">Priority Red</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-on-surface-variant font-label-md">Waiting lounge</Label>
              <Select value={form.lounge} onValueChange={(v) => setForm({ ...form, lounge: v })}>
                <SelectTrigger className="bg-surface-container-lowest border-outline-variant w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOUNGES.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 pt-space-xs">
              <Button
                onClick={() => void submit()}
                disabled={busy}
                className="w-full bg-primary text-on-primary hover:bg-primary-container rounded-full font-label-lg text-label-lg h-11"
              >
                <span className="material-symbols-outlined text-[18px]">confirmation_number</span>
                {busy ? "Registering…" : `Register & Issue Ticket ${nextTicket}`}
              </Button>
            </div>
          </div>
        </Panel>

        {/* Queues */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          <Panel>
            <PanelHeader
              icon="hourglass_top"
              title="Waiting for Intake Processing"
              sub="Mothers queued at the reception desk"
              right={
                <span className="bg-surface-container text-primary font-label-md text-label-md px-2.5 py-0.5 rounded-full">
                  {waiting.length} waiting
                </span>
              }
            />
            <div className="px-space-md pb-space-md divide-y divide-surface-container max-h-80 overflow-y-auto thin-scroll">
              {waiting.length === 0 && <EmptyState icon="event_available" label="No patients waiting at reception." />}
              {waiting.map((p) => (
                <QueueRow key={p.id} patient={p} />
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon="receipt_long" title="Today's Registration Log" sub="Latest issued tickets across the wing" />
            <div className="px-space-md pb-space-md">
              <div className="max-h-72 overflow-y-auto thin-scroll">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-on-surface-variant font-label-md text-label-md border-b border-border">
                      <th className="py-2 pr-2 font-medium">Ticket</th>
                      <th className="py-2 pr-2 font-medium">Name</th>
                      <th className="py-2 pr-2 font-medium hidden md:table-cell">Type</th>
                      <th className="py-2 pr-2 font-medium">Current stage</th>
                      <th className="py-2 font-medium">Issued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
                    {(today?.patients ?? []).slice(0, 14).map((p) => (
                      <tr key={p.id} className="text-on-surface">
                        <td className="py-2 pr-2 font-label-md text-label-md text-primary font-bold">{p.ticket}</td>
                        <td className="py-2 pr-2 truncate max-w-36">{p.name}</td>
                        <td className="py-2 pr-2 hidden md:table-cell text-on-surface-variant">{VISIT_TYPE_META[p.visitType]?.label ?? p.visitType}</td>
                        <td className="py-2 pr-2">
                          <span className="bg-surface-container text-on-surface-variant font-label-md text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap">
                            {p.status === "COMPLETED" ? "Completed" : p.stage}
                          </span>
                        </td>
                        <td className="py-2 text-on-surface-variant" suppressHydrationWarning>{catTime(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
