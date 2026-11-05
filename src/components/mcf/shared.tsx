"use client";

import { cn } from "@/lib/utils";
import { PRIORITY_META, minutesSince, fmtWait, LOAD_META } from "@/lib/queue";
import type { Patient } from "@/lib/api-client";

// ---------------- Logo ----------------
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("h-8 w-8", className)} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#005c55" />
      <path
        d="M17 36c-1.2-1-8-6.4-8-12a6 6 0 0 1 10.7-3.7l.8 1 .8-1A6 6 0 0 1 32 24c0 5.6-6.8 11-8 12h-7z"
        fill="#9cf2e8"
      />
      <circle cx="33.5" cy="16.5" r="5.5" fill="#ffdbce" />
      <circle cx="33.5" cy="15" r="2.4" fill="#7e4126" />
    </svg>
  );
}

export function BrandBlock() {
  return (
    <div className="flex items-center gap-space-sm">
      <LogoMark />
      <div className="flex flex-col">
        <span className="font-title-md text-title-md text-primary tracking-tight">Moms Care Flow</span>
        <span className="font-label-md text-label-md text-on-surface-variant">Maternal &amp; Paediatric Care</span>
      </div>
    </div>
  );
}

// ---------------- Chitenge strip ----------------
export function ChitengeBar({ className }: { className?: string }) {
  return (
    <div className={cn("w-full h-1.5 rounded-full overflow-hidden flex", className)}>
      <div className="h-full w-1/4 bg-primary" />
      <div className="h-full w-1/12 bg-tertiary" />
      <div className="h-full w-1/3 bg-primary-container" />
      <div className="h-full w-1/6 bg-secondary" />
      <div className="h-full w-1/4 bg-tertiary-container" />
    </div>
  );
}

// ---------------- Chips ----------------
export function PriorityChip({ priority, className }: { priority: string; className?: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.ROUTINE;
  return (
    <span
      className={cn(
        "font-label-md text-[10px] px-2 py-0.5 rounded-full uppercase font-bold inline-flex items-center gap-1",
        meta.chip,
        className
      )}
    >
      {meta.label}
    </span>
  );
}

export function LoadChip({ state }: { state: "SMOOTH" | "MODERATE" | "HIGH" }) {
  const meta = LOAD_META[state];
  return (
    <span className={cn("font-label-md text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider", meta.badge)}>
      {meta.chip}
    </span>
  );
}

export function TicketAvatar({ patient, size = "md" }: { patient: Pick<Patient, "ticket" | "priority">; size?: "sm" | "md" | "lg" }) {
  const meta = PRIORITY_META[patient.priority] ?? PRIORITY_META.ROUTINE;
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0 font-label-md font-bold",
        meta.avatar,
        size === "sm" && "w-8 h-8 text-[10px]",
        size === "md" && "w-10 h-10 text-[11px]",
        size === "lg" && "w-14 h-14 text-[15px]"
      )}
    >
      {patient.ticket}
    </div>
  );
}

export function WaitPill({ from, className }: { from: string; className?: string }) {
  const mins = minutesSince(from);
  const tone =
    mins >= 30
      ? "bg-error-container text-on-error-container"
      : mins >= 20
        ? "bg-tertiary-fixed text-on-tertiary-fixed"
        : "bg-surface-container text-primary";
  return (
    <span className={cn("font-label-md text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1", tone, className)}>
      <span className="material-symbols-outlined text-[12px]">timer</span>
      {fmtWait(mins)}
    </span>
  );
}

// ---------------- Panels ----------------
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-surface-container-lowest rounded-xl shadow-sm", className)}>{children}</div>;
}

export function PanelHeader({
  icon,
  title,
  sub,
  right,
}: {
  icon?: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm p-space-md pb-2">
      <div className="flex items-center gap-space-sm">
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[22px]">{icon}</span>
          </div>
        )}
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">{title}</h3>
          {sub && <p className="font-body-sm text-body-sm text-on-surface-variant">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon = "inbox", label }: { icon?: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <span className="material-symbols-outlined text-[36px] text-outline-variant">{icon}</span>
      <p className="font-label-lg text-label-lg text-on-surface-variant">{label}</p>
    </div>
  );
}

export function ProgressBar({ value, tone = "bg-primary", className }: { value: number; tone?: string; className?: string }) {
  return (
    <div className={cn("w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ---------------- Station page header ----------------
export function StationShell({
  icon,
  title,
  sub,
  stats,
  actions,
}: {
  icon: string;
  title: string;
  sub: string;
  stats?: Array<{ label: string; value: React.ReactNode; tone?: string }>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-lg">
      <div className="flex items-center gap-space-sm">
        <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-[0_2px_8px_rgba(15,118,110,0.2)]">
          <span className="material-symbols-outlined text-[26px]">{icon}</span>
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">{title}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-space-md flex-wrap">
        {stats?.map((s) => (
          <div key={s.label} className="bg-surface-container-lowest px-space-md py-space-sm rounded-xl shadow-sm flex flex-col min-w-24">
            <span className="font-label-md text-label-md text-on-surface-variant">{s.label}</span>
            <span className={cn("font-label-numeric text-label-numeric", s.tone ?? "text-primary")}>{s.value}</span>
          </div>
        ))}
        {actions}
      </div>
    </div>
  );
}

// ---------------- Patient queue row ----------------
export function QueueRow({
  patient,
  children,
  onClick,
  selected,
}: {
  patient: Patient;
  children?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const visitLabel =
    patient.visitType === "ANTENATAL"
      ? `Antenatal${patient.trimester ? ` • ${patient.trimester} trimester${patient.gestationWk ? ` (${patient.gestationWk}w)` : ""}` : ""}`
      : patient.visitType === "PAEDIATRIC"
        ? "Paediatric"
        : patient.visitType === "POSTNATAL"
          ? "Postnatal"
          : patient.visitType === "ULTRASOUND"
            ? "Ultrasound"
            : "General OPD";
  return (
    <div
      className={cn(
        "py-space-sm px-space-md flex items-center gap-space-sm transition-colors first:pt-0 last:pb-0",
        selected && "bg-surface-container rounded-lg",
        onClick && "cursor-pointer hover:bg-surface-container rounded-lg"
      )}
      onClick={onClick}
    >
      <TicketAvatar patient={patient} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-space-xs flex-wrap">
          <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{patient.name}</span>
          <PriorityChip priority={patient.priority} />
        </div>
        <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2 flex-wrap">
          <span>{patient.ticket}</span>
          <span>•</span>
          <span>{visitLabel}</span>
          {patient.lounge && (
            <>
              <span>•</span>
              <span>
                {patient.lounge} Seat {patient.seat}
              </span>
            </>
          )}
          {patient.age !== null && (
            <>
              <span>•</span>
              <span>{patient.age === 0 ? "Infant" : `${patient.age}y`}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-space-sm shrink-0 flex-wrap justify-end">
        <WaitPill from={patient.stageEnteredAt} />
        {children}
      </div>
    </div>
  );
}
