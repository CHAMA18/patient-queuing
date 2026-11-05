"use client";

import { cn } from "@/lib/utils";
import { catClock, catDateLong } from "@/lib/cat";
import { useNow } from "@/hooks/use-queue-socket";
import { MobileNav, type ViewKey } from "./sidebar";
import type { AlertItem } from "@/lib/api-client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function Header({
  view,
  onNavigate,
  alerts,
  onAlertAction,
  settings,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  alerts: AlertItem[];
  onAlertAction: (a: AlertItem, which: "primary" | "secondary") => void;
  settings: Record<string, string>;
}) {
  const now = useNow(1000);
  const initials = "MM";

  return (
    <header className="fixed top-0 inset-x-0 lg:left-72 h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(12,31,27,0.04)] z-40 flex items-center justify-between px-4 lg:px-space-lg">
      <div className="flex items-center gap-space-md min-w-0">
        <MobileNav view={view} onNavigate={onNavigate} />
        <div className="hidden md:flex items-center gap-space-xs text-on-surface-variant min-w-0">
          <span className="material-symbols-outlined text-primary text-[20px]">local_hospital</span>
          <span className="font-title-md text-title-md text-on-surface font-semibold truncate">
            {settings.hospitalName ?? "Lusaka Central Hospital"}
          </span>
        </div>
        <div className="hidden md:block h-4 w-px bg-outline-variant" />
        <div className="flex items-center gap-space-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-[18px]">schedule</span>
          <span className="font-label-lg text-label-lg text-on-surface font-semibold whitespace-nowrap" suppressHydrationWarning>
            {now ? catClock(now) : "— CAT"}
          </span>
        </div>
        <div className="hidden xl:block h-4 w-px bg-outline-variant" />
        <div className="hidden xl:flex items-center gap-space-xs bg-secondary-container px-space-sm py-1 rounded-full text-on-secondary-container font-label-md text-label-md">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>ONLINE — LOCAL SYNC ACTIVE</span>
        </div>
      </div>

      <div className="flex items-center gap-space-md">
        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label={`Notifications${alerts.length ? `, ${alerts.length} active` : ""}`}
              className="relative p-space-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              {alerts.length > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-tertiary text-on-tertiary font-label-md text-[10px] leading-tight flex items-center justify-center rounded-full">
                  {alerts.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <p className="font-label-lg text-label-lg text-on-surface">Needs Attention</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {alerts.length ? `${alerts.length} active issue${alerts.length > 1 ? "s" : ""}` : "All clear right now"}
                </p>
              </div>
              <span className="material-symbols-outlined text-primary text-[20px]">radar</span>
            </div>
            <div className="max-h-80 overflow-y-auto thin-scroll divide-y divide-border">
              {alerts.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <span className="material-symbols-outlined text-[28px] text-outline-variant">verified</span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    No bottlenecks — patient flow is smooth.
                  </p>
                </div>
              )}
              {alerts.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-label-lg text-label-lg text-on-surface leading-snug">{a.title}</p>
                    <span
                      className={cn(
                        "font-label-md text-[10px] px-2 py-0.5 rounded-full shrink-0 uppercase font-bold",
                        a.severity === "HIGH" ? "bg-error-container text-on-error-container" : "bg-tertiary-fixed text-on-tertiary-fixed"
                      )}
                    >
                      {a.chip}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">{a.body}</p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      className="h-7 rounded-full bg-primary text-on-primary hover:bg-primary-container"
                      onClick={() => onAlertAction(a, "primary")}
                    >
                      {a.actionLabel}
                    </Button>
                    {a.secondaryLabel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full border-outline-variant text-on-surface-variant"
                        onClick={() => onAlertAction(a, "secondary")}
                      >
                        {a.secondaryLabel}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="hidden sm:block h-6 w-px bg-outline-variant" />

        <div className="flex items-center gap-space-sm pl-space-xs">
          <div
            className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label-md text-[12px] font-bold"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="font-label-lg text-label-lg text-on-surface font-semibold leading-tight">
              Sister Mary Mutale
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant leading-tight">
              Charge Nurse / Administrator
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
