"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, postJson, type DashboardData, type AlertItem } from "@/lib/api-client";
import { catTime, catDateLong } from "@/lib/cat";
import { useNow } from "@/hooks/use-queue-socket";
import { STAGE_META, type Stage } from "@/lib/queue";
import { ChitengeBar, Panel, PanelHeader, EmptyState, ProgressBar, TicketAvatar } from "./shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { AuditEvent } from "@/lib/api-client";

const FEED_AVATAR_TONES = ["bg-surface-container text-primary", "bg-tertiary-fixed text-on-tertiary-fixed", "bg-secondary-container text-on-secondary-container"];

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lusaka" }).format(new Date()));
  if (h < 12) return "Good morning, welcome to Moms Care.";
  if (h < 17) return "Good afternoon, welcome to Moms Care.";
  return "Good evening, welcome to Moms Care.";
}

export function AuditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api<{ events: AuditEvent[]; total: number }>("/api/audit?take=250"),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">history_edu</span>
            Full Audit Trail
          </DialogTitle>
          <DialogDescription className="text-on-surface-variant font-body-sm">
            Every registration, movement, alert and handover recorded today — {data?.total ?? "…"} events.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="divide-y divide-border">
            {data?.events.map((e) => (
              <div key={e.id} className="px-6 py-3 flex items-start gap-3">
                <span className="font-label-md text-label-md text-on-surface-variant w-16 shrink-0" suppressHydrationWarning>
                  {catTime(e.createdAt)}
                </span>
                {e.ticket ? (
                  <span className="bg-surface-container text-primary font-label-md text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                    {e.ticket}
                  </span>
                ) : (
                  <span className="bg-secondary-container text-on-secondary-container font-label-md text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                    SYS
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface">{e.title}</p>
                  {e.detail && <p className="font-body-sm text-body-sm text-on-surface-variant">{e.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function AlertCard({
  alert,
  onAction,
}: {
  alert: AlertItem;
  onAction: (a: AlertItem, which: "primary" | "secondary") => void;
}) {
  const accent =
    alert.severity === "HIGH" ? "bg-tertiary" : "bg-secondary";
  const iconBg =
    alert.kind === "overrun" ? "bg-secondary-container text-on-secondary-container" : alert.kind === "centrifuge" ? "bg-surface-container text-tertiary" : "bg-tertiary-fixed text-on-tertiary-fixed";
  const icon = alert.kind === "overrun" ? "schedule" : alert.kind === "centrifuge" ? "chips" : alert.kind === "escalation" ? "campaign" : "e911_emergency";
  const buttonClass =
    alert.kind === "triage"
      ? "bg-tertiary text-on-tertiary hover:bg-tertiary-container"
      : alert.kind === "overrun"
        ? "bg-surface-container text-secondary hover:bg-surface-container-high"
        : "bg-surface-container text-primary hover:bg-surface-container-high";

  return (
    <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm relative overflow-hidden">
      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", accent)} />
      <div className="flex items-start justify-between gap-space-sm pl-1">
        <div className="flex items-start gap-space-sm min-w-0">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className="font-title-md text-title-md text-on-surface font-semibold">{alert.title}</span>
              <span className={cn("px-2 py-0.5 rounded-full font-label-md text-[10px] uppercase font-bold", alert.severity === "HIGH" ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-secondary-container text-on-secondary-container")}>
                {alert.chip}
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">{alert.body}</p>
            <div className="mt-2 text-body-sm text-on-surface-variant flex items-center gap-space-sm flex-wrap">
              {alert.meta.map((m, i) => (
                <span key={i} className="flex items-center gap-space-sm">
                  {i > 0 && <span>•</span>}
                  <span>{m}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => onAction(alert, "primary")}
            className={cn("font-label-md text-label-md px-3 py-1.5 rounded-full transition-colors shadow-sm whitespace-nowrap", buttonClass)}
          >
            {alert.actionLabel}
          </button>
          {alert.secondaryLabel && (
            <button
              onClick={() => onAction(alert, "secondary")}
              className="font-label-md text-label-md px-3 py-1.5 rounded-full transition-colors bg-surface-container-low text-on-surface-variant hover:bg-surface-container whitespace-nowrap"
            >
              {alert.secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OverviewView({ data, isLoading, onOpenAudit }: { data?: DashboardData; isLoading: boolean; onOpenAudit: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = useNow(30000);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["display"] });
  }, [queryClient]);

  const runAction = useCallback(
    async (action: string, label: string, body: Record<string, unknown> = {}) => {
      setBusy(action);
      try {
        await postJson("/api/actions", { action, ...body });
        toast({ title: label, description: "Command executed — flow map is syncing." });
        refresh();
      } catch (e) {
        toast({ title: "Action failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
      } finally {
        setBusy(null);
      }
    },
    [refresh, toast]
  );

  const onAlertAction = useCallback(
    (a: AlertItem, which: "primary" | "secondary") => {
      if (a.kind === "triage") {
        void runAction("fast-track", "Patient fast-tracked to Room 01", { patientId: a.patientId });
      } else if (a.kind === "centrifuge") {
        void runAction(which === "primary" ? "route-satellite" : "resolve-alert", "Lab alert handled", { eventId: a.eventId });
      } else if (a.kind === "overrun") {
        void runAction(which === "primary" ? "split-queue" : "broadcast", "Queue rebalanced", { roomId: a.roomId });
      } else {
        void runAction("resolve-alert", "Escalation resolved", { eventId: a.eventId });
      }
    },
    [runAction]
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-space-md">
        <div className="h-24 rounded-xl bg-surface-container animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-space-md">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  const { kpis, nodes, alerts, feed, eventCount, settings } = data;
  const dateLine = now ? catDateLong(now) : "";

  const quickActions: Array<{ key: string; icon: string; label: string; primary?: boolean }> = [
    { key: "reallocate", icon: "swap_horiz", label: "Reallocate Nurse Station" },
    { key: "overflow", icon: "meeting_room", label: "Trigger Overflow Room" },
    { key: "broadcast", icon: "campaign", label: "Broadcast Queue Update", primary: true },
  ];

  return (
    <div className="flex flex-col w-full">
      <ChitengeBar className="mb-space-md" />

      {/* Welcome header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-primary font-label-md text-label-md mb-1 uppercase tracking-wider">
            <span className="material-symbols-outlined text-[16px]">verified</span>
            {settings.hospitalName ?? "Lusaka Central Hospital"} • {settings.wing ?? "Maternity & Pediatric Wing"}
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight" suppressHydrationWarning>
            {greeting()}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5" suppressHydrationWarning>
            {dateLine ? `${dateLine} • ` : ""}Here&apos;s how patient care is flowing across your hospital today.
          </p>
        </div>
        <div className="flex items-center gap-space-sm flex-wrap">
          <div className="bg-surface-container-lowest px-space-md py-space-xs rounded-full shadow-sm flex items-center gap-space-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <span className="font-label-md text-label-md text-on-surface font-semibold">Realtime Flow Monitor</span>
            <span className="text-on-surface-variant text-[12px]">• Syncing every 10s</span>
          </div>
          <Button
            onClick={() => void runAction("escalate", "Capacity alert escalated to Ward C")}
            disabled={busy === "escalate"}
            className="bg-primary text-on-primary font-label-lg text-label-lg px-space-md py-space-sm rounded-full shadow-md hover:bg-primary-container transition-all gap-1.5 active:scale-95 h-auto"
          >
            <span className="material-symbols-outlined text-[18px]">emergency_share</span>
            <span>Escalate Capacity Alert</span>
          </Button>
        </div>
      </header>

      {/* KPI ribbon */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-space-md mb-space-xl">
        <KpiCard
          label="Registered Today"
          icon="how_to_reg"
          iconTone="text-primary"
          value={kpis.registeredToday}
          foot={
            <span className="flex items-center gap-1 text-[11px] font-label-md text-primary font-semibold">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              <span>Live intake counter</span>
            </span>
          }
        />
        <KpiCard
          label="Currently Waiting"
          icon="chair"
          iconTone="text-secondary"
          value={kpis.waiting}
          foot={
            <span className="text-[11px] font-body-sm text-on-surface-variant flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              <span>Across {data.loungeLoad.length} lounges</span>
            </span>
          }
        />
        <KpiCard
          label="Attended To"
          icon="stethoscope"
          iconTone="text-primary-container"
          value={kpis.attended}
          valueTone="text-primary-container"
          foot={
            <span className="text-[11px] font-body-sm text-on-surface-variant flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
              <span>Consult &amp; clinical bays</span>
            </span>
          }
        />
        <KpiCard
          label="Visits Completed"
          icon="task_alt"
          iconTone="text-primary"
          value={kpis.completed}
          foot={<span className="text-[11px] font-body-sm text-on-surface-variant">Across all stations today</span>}
        />
        <KpiCard
          label="Avg Waiting Time"
          icon="timer"
          iconTone="text-primary"
          value={
            <>
              {kpis.avgWaitMin}
              <span className="text-body-sm font-normal text-on-surface-variant ml-0.5">m</span>
            </>
          }
          valueTone="text-primary"
          foot={
            <span className={cn("text-[11px] font-label-md font-semibold flex items-center gap-1", kpis.avgWaitMin <= kpis.targetWaitMin ? "text-primary" : "text-tertiary")}>
              <span className="material-symbols-outlined text-[14px]">{kpis.avgWaitMin <= kpis.targetWaitMin ? "check_circle" : "warning"}</span>
              <span>{kpis.avgWaitMin <= kpis.targetWaitMin ? `Within ${kpis.targetWaitMin}m target` : `Above ${kpis.targetWaitMin}m target`}</span>
            </span>
          }
        />
        <KpiCard
          label="Longest Queue"
          icon="hourglass_top"
          iconTone="text-tertiary"
          value={
            <>
              {kpis.longestQueue.mins}
              <span className="text-body-sm font-normal text-tertiary ml-0.5">m</span>
            </>
          }
          valueTone="text-tertiary"
          headTone="text-tertiary"
          foot={
            <span className="text-[11px] font-label-md text-tertiary font-semibold truncate" title={kpis.longestQueue.label}>
              {kpis.longestQueue.label}
            </span>
          }
        />
      </section>

      {/* Living flow map */}
      <section className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm mb-space-xl relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-64 h-64 bg-surface-container-low rounded-full opacity-40 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm mb-space-lg">
          <div className="flex items-center gap-space-sm">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">device_hub</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Living Patient Flow Map</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Real-time departmental routing throughput • Antenatal, Triage &amp; Paediatric Stream
              </p>
            </div>
          </div>
          <div className="flex items-center gap-space-md flex-wrap text-label-md font-label-md text-on-surface-variant">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /> Smooth Flow</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-secondary" /> Moderate Load</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-tertiary" /> Attention Required</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-space-md relative">
          {nodes.map((n) => {
            const isHigh = n.state === "HIGH";
            const tone = isHigh ? "text-tertiary" : n.state === "MODERATE" ? "text-secondary" : "text-primary";
            const chipTone = isHigh
              ? "bg-tertiary-fixed text-on-tertiary-fixed"
              : n.state === "MODERATE"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-surface-container text-primary";
            const dotTone = isHigh ? "bg-tertiary text-on-tertiary" : n.state === "MODERATE" ? "bg-secondary text-on-secondary" : "bg-primary text-on-primary";
            const barTone = isHigh ? "bg-tertiary" : n.state === "MODERATE" ? "bg-secondary" : "bg-primary";
            return (
              <div
                key={n.stage}
                className={cn(
                  "p-space-md rounded-xl flex flex-col justify-between relative group transition-all",
                  isHigh ? "bg-surface-container shadow-sm" : "bg-surface-container-low hover:bg-surface-container"
                )}
              >
                <div className="flex items-center justify-between mb-space-sm">
                  <span className={cn("w-6 h-6 rounded-full font-label-md text-[11px] flex items-center justify-center font-bold", dotTone)}>
                    {n.node}
                  </span>
                  <span className={cn("font-label-md text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider", chipTone, isHigh && "font-semibold")}>
                    {isHigh ? "High Attention" : n.state === "MODERATE" ? "Moderate" : "Smooth"}
                  </span>
                </div>
                <div>
                  <div className={cn("font-title-md text-title-md font-semibold flex items-center gap-1", tone)}>
                    <span>{n.label}</span>
                  </div>
                  <div className="text-[12px] font-body-sm text-on-surface-variant mt-0.5">{n.sub}</div>
                </div>
                <div className="my-space-sm pt-space-xs">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className={cn("font-headline-sm text-headline-sm", isHigh ? "text-tertiary" : "text-on-surface")}>{n.rate}</span>
                    <span className={cn("font-label-md text-label-md text-on-surface-variant", isHigh && "text-tertiary")}>{n.rateUnit}</span>
                  </div>
                  <ProgressBar value={n.util} tone={barTone} />
                </div>
                <div className="pt-space-xs flex items-center justify-between text-body-sm text-on-surface-variant text-[12px]">
                  <span className={cn("flex items-center gap-1 font-semibold", isHigh ? "text-tertiary" : "text-on-surface")}>
                    {isHigh && <span className="material-symbols-outlined text-[14px] text-tertiary">warning</span>}
                    {!isHigh && <span className={cn("material-symbols-outlined text-[14px]", n.state === "MODERATE" ? "text-secondary" : "text-primary")}>person</span>}
                    {n.waiting} waiting{n.longestWait > 0 ? ` (${n.longestWait}m)` : ""}
                  </span>
                  <span>{n.staff} {n.staffLabel}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-space-md pt-space-md flex flex-col sm:flex-row sm:items-center justify-between text-body-sm text-on-surface-variant gap-space-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">sync</span>
            <span>
              Average patient journey velocity: <strong>{data.journeyVelocity} stages / hour</strong>. Fetal Doppler triage target is fully met.
            </span>
          </div>
          <div className="flex items-center gap-space-sm">
            <span className="font-label-md text-label-md text-on-surface">Main Ward Occupancy:</span>
            <div className="w-32">
              <ProgressBar value={kpis.wardOccupancyPct} />
            </div>
            <span className="font-label-md text-label-md font-semibold text-primary">{kpis.wardOccupancyPct}%</span>
          </div>
        </div>
      </section>

      {/* Command deck */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-lg">
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-tertiary text-[22px]">radar</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Needs Attention • Bottleneck Radar</h3>
            </div>
            <span className="bg-error-container text-on-error-container font-label-md text-label-md px-2.5 py-0.5 rounded-full font-semibold">
              {alerts.length} Active Issue{alerts.length === 1 ? "" : "s"}
            </span>
          </div>

          {alerts.length === 0 && (
            <Panel className="p-space-md">
              <EmptyState icon="verified" label="No bottlenecks — every station is flowing smoothly." />
            </Panel>
          )}
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} onAction={onAlertAction} />
          ))}

          {/* Quick actions */}
          <div className="bg-surface-container-low p-space-md rounded-xl mt-space-xs flex flex-col sm:flex-row items-center justify-between gap-space-sm">
            <div className="flex items-center gap-2 text-primary font-label-md text-label-md">
              <span className="material-symbols-outlined text-[20px]">bolt</span>
              <span>Command Quick Actions:</span>
            </div>
            <div className="flex items-center gap-space-xs flex-wrap justify-end">
              {quickActions.map((qa) => (
                <Button
                  key={qa.key}
                  disabled={busy === qa.key}
                  onClick={() => void runAction(qa.key, `${qa.label} executed`)}
                  className={cn(
                    "font-label-md text-label-md px-3.5 py-1.5 rounded-full shadow-sm transition-all gap-1 active:scale-95 h-auto",
                    qa.primary
                      ? "bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary"
                      : "bg-surface-container-lowest text-primary hover:bg-surface"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">{qa.icon}</span>
                  <span>{qa.label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Live feed */}
        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-primary text-[22px]">stream</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Live Queue Movement</h3>
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant font-body-sm text-[12px]">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>Live feed</span>
            </div>
          </div>
          <Panel className="p-space-md flex flex-col flex-1 divide-y divide-surface-container">
            {feed.map((f, i) => (
              <div key={f.id} className="py-space-sm first:pt-0 last:pb-0 flex items-start gap-space-sm">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-label-md text-[11px] font-bold", FEED_AVATAR_TONES[i % FEED_AVATAR_TONES.length])}>
                  {f.ticket ?? "SYS"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{f.title}</span>
                    <span className="font-label-md text-label-md text-on-surface-variant shrink-0" suppressHydrationWarning>
                      {catTime(f.at)}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{f.detail}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {f.tag && (
                      <span className="bg-surface-container text-primary font-label-md text-[10px] px-2 py-0.5 rounded-full">{f.tag}</span>
                    )}
                    {(f.extra || f.gate) && (
                      <span className="text-[11px] text-on-surface-variant">{f.gate ?? f.extra}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </Panel>
          <div className="flex items-center justify-between text-[12px] font-body-sm text-on-surface-variant px-space-xs">
            <span>Showing latest {feed.length} of {eventCount} events today</span>
            <button
              onClick={onOpenAudit}
              className="text-primary font-label-md text-label-md hover:underline flex items-center gap-1"
            >
              <span>Open Full Audit Trail</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </section>

      {/* Environment strip */}
      <footer className="bg-surface-container-low p-space-md rounded-xl flex flex-col md:flex-row items-center justify-between gap-space-md text-on-surface-variant">
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">wifi</span>
            <span className="font-label-md text-label-md text-on-surface font-semibold">Lusaka HealthNet Grid</span>
            <span className="text-[12px] text-primary font-bold">({settings.uptimePct ?? "99.98"}% uptime)</span>
          </div>
          <div className="hidden md:block w-px h-4 bg-outline-variant" />
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[18px]">battery_charging_full</span>
            <span className="font-body-sm text-body-sm">
              Solar Backup Array: <strong>{settings.solarPct ?? "100"}% (Grid Online)</strong>
            </span>
          </div>
          <div className="hidden md:block w-px h-4 bg-outline-variant" />
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-[18px]">water_drop</span>
            <span className="font-body-sm text-body-sm">
              Cold Chain Vaccines: <strong>{settings.coldChainC ?? "4.2"}°C (Optimal)</strong>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm text-[12px]">
          <span>Moms Care Flow OS • {settings.hospitalName ?? "Lusaka Central"} Maternity v2.4</span>
          <a
            href="/api/report"
            className="bg-surface-container-lowest text-primary px-3 py-1 rounded-full font-label-md text-label-md shadow-sm hover:bg-surface transition-colors inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export Daily Report
          </a>
        </div>
      </footer>
    </div>
  );
}

function KpiCard({
  label,
  icon,
  iconTone,
  value,
  valueTone,
  headTone,
  foot,
}: {
  label: string;
  icon: string;
  iconTone?: string;
  value: React.ReactNode;
  valueTone?: string;
  headTone?: string;
  foot?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className="absolute -right-3 -top-3 w-16 h-16 bg-surface-container rounded-full opacity-60 pointer-events-none" />
      <div className={cn("flex items-center justify-between text-on-surface-variant mb-1", headTone)}>
        <span className="font-label-md text-label-md">{label}</span>
        <span className={cn("material-symbols-outlined text-[18px]", iconTone ?? "text-primary")}>{icon}</span>
      </div>
      <div className="my-1">
        <div className={cn("font-label-numeric text-label-numeric text-on-surface", valueTone)}>{value}</div>
      </div>
      <div>{foot}</div>
    </div>
  );
}
