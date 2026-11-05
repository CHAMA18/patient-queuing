"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, patchJson, postJson, type SettingsData, type StaffMember } from "@/lib/api-client";
import { StationShell, Panel, PanelHeader } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const STATION_OPTIONS = ["REGISTRATION", "VITALS", "CONSULTATION", "LAB", "REVIEW", "PHARMACY"];

export function SettingsView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [targetWait, setTargetWait] = useState("");
  const [consultTarget, setConsultTarget] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [bedCap, setBedCap] = useState("");
  const [newStaff, setNewStaff] = useState({ name: "", role: "", station: "CONSULTATION" });

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsData>("/api/settings"),
    refetchInterval: 30000,
  });

  const s = data?.settings ?? {};
  const staff = data?.staff ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["display"] });
  };

  const saveNumbers = async () => {
    setBusy(true);
    try {
      const values: Record<string, string> = {};
      if (targetWait) values.targetWaitMin = targetWait;
      if (consultTarget) values.consultTargetMin = consultTarget;
      if (occupancy) values.wardOccupancyPct = occupancy;
      if (bedCap) values.wardCBedCapPct = bedCap;
      if (Object.keys(values).length === 0) {
        toast({ title: "Nothing to save", description: "Adjust a value first." });
        return;
      }
      await patchJson("/api/settings", { values });
      toast({ title: "Flow settings saved", description: "Command centre thresholds updated." });
      setTargetWait("");
      setConsultTarget("");
      setOccupancy("");
      setBedCap("");
      refresh();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleStaff = async (st: StaffMember) => {
    try {
      await patchJson("/api/settings", { staff: [{ id: st.id, active: !st.active }] });
      toast({ title: st.active ? `${st.name} deactivated` : `${st.name} reactivated` });
      refresh();
    } catch (e) {
      toast({ title: "Update failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const addStaff = async () => {
    if (!newStaff.name.trim() || !newStaff.role.trim()) {
      toast({ title: "Name and role required", variant: "destructive" });
      return;
    }
    try {
      await patchJson("/api/settings", { newStaff });
      toast({ title: `${newStaff.name} added to roster` });
      setNewStaff({ name: "", role: "", station: "CONSULTATION" });
      refresh();
    } catch (e) {
      toast({ title: "Could not add staff", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const resetDemo = async () => {
    setBusy(true);
    try {
      await postJson("/api/settings", {});
      toast({ title: "Demo day reset", description: "Queue, events and staff restored to the morning seed." });
      refresh();
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["patients-today"] });
    } catch (e) {
      toast({ title: "Reset failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StationShell
        icon="tune"
        title="Hospital Flow Settings"
        sub="Targets, staffing and demo controls for the maternity wing"
        actions={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={busy}
                className="rounded-full border-error/40 text-on-error-container hover:bg-error-container/50"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Reset Demo Day
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This wipes all patients, events and staff from today and restores the seeded morning queue (184 registrations, MC-015/018/019/022/024/025 scenario). Useful for demos and training.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void resetDemo()} className="rounded-full bg-error text-white hover:bg-error/90">
                  Reset now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Flow targets */}
        <Panel className="lg:col-span-5 h-fit">
          <PanelHeader icon="speed" title="Flow Targets & Capacity" sub="Thresholds used by the bottleneck radar" />
          <div className="p-space-md pt-0 grid grid-cols-2 gap-space-sm">
            <div className="space-y-1.5">
              <Label className="text-on-surface-variant font-label-md">Target wait (min)</Label>
              <Input
                inputMode="numeric"
                placeholder={s.targetWaitMin ?? "20"}
                value={targetWait}
                onChange={(e) => setTargetWait(e.target.value.replace(/\D/g, ""))}
                className="bg-surface-container-lowest border-outline-variant"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-on-surface-variant font-label-md">Consult session target (min)</Label>
              <Input
                inputMode="numeric"
                placeholder={s.consultTargetMin ?? "24"}
                value={consultTarget}
                onChange={(e) => setConsultTarget(e.target.value.replace(/\D/g, ""))}
                className="bg-surface-container-lowest border-outline-variant"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-on-surface-variant font-label-md">Ward occupancy (%)</Label>
              <Input
                inputMode="numeric"
                placeholder={s.wardOccupancyPct ?? "74"}
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value.replace(/\D/g, ""))}
                className="bg-surface-container-lowest border-outline-variant"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-on-surface-variant font-label-md">Ward C bed cap (%)</Label>
              <Input
                inputMode="numeric"
                placeholder={s.wardCBedCapPct ?? "92"}
                value={bedCap}
                onChange={(e) => setBedCap(e.target.value.replace(/\D/g, ""))}
                className="bg-surface-container-lowest border-outline-variant"
              />
            </div>
            <div className="col-span-2">
              <Button
                onClick={() => void saveNumbers()}
                disabled={busy}
                className="w-full bg-primary text-on-primary hover:bg-primary-container rounded-full h-10 font-label-lg text-label-lg"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                Save Flow Settings
              </Button>
            </div>
          </div>
          <div className="px-space-md pb-space-md">
            <div className="bg-surface-container-low rounded-lg p-3 space-y-1.5">
              <p className="font-label-md text-label-md text-on-surface font-semibold">Environment (read-only)</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Lusaka HealthNet Grid uptime: {s.uptimePct ?? "99.98"}%</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Solar backup array: {s.solarPct ?? "100"}% (Grid Online)</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Cold chain vaccines: {s.coldChainC ?? "4.2"}°C (Optimal)</p>
            </div>
          </div>
        </Panel>

        {/* Staff roster */}
        <Panel className="lg:col-span-7">
          <PanelHeader
            icon="groups"
            title="Staff Roster"
            sub={`${staff.filter((x) => x.active).length} active of ${staff.length} on the maternity wing`}
          />
          <div className="px-space-md pb-space-md">
            <div className="max-h-72 overflow-y-auto thin-scroll divide-y divide-surface-container">
              {isLoading && <p className="font-body-sm text-body-sm text-on-surface-variant py-4">Loading roster…</p>}
              {staff.map((st) => (
                <div key={st.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{st.name}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {st.role} • {st.station}{st.room ? ` • ${st.room}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-label-md text-[10px] px-2 py-0.5 rounded-full ${st.active ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface-variant"}`}>
                      {st.active ? "On shift" : "Off"}
                    </span>
                    <Switch checked={st.active} onCheckedChange={() => void toggleStaff(st)} aria-label={`Toggle ${st.name}`} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-space-md pt-space-md border-t border-border grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input
                placeholder="Full name"
                value={newStaff.name}
                onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                className="bg-surface-container-lowest border-outline-variant"
              />
              <Input
                placeholder="Role e.g. Triage Nurse"
                value={newStaff.role}
                onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                className="bg-surface-container-lowest border-outline-variant"
              />
              <Select value={newStaff.station} onValueChange={(v) => setNewStaff({ ...newStaff, station: v })}>
                <SelectTrigger className="bg-surface-container-lowest border-outline-variant w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATION_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void addStaff()} className="bg-primary text-on-primary hover:bg-primary-container rounded-full">
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                Add staff
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
