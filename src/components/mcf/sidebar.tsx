"use client";

import { cn } from "@/lib/utils";
import { BrandBlock } from "./shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export type ViewKey =
  | "overview"
  | "reception"
  | "vitals"
  | "consultation"
  | "laboratory"
  | "pharmacy"
  | "display"
  | "settings";

export const VIEWS: Array<{ key: ViewKey; label: string; icon: string; group: "flow" | "admin" }> = [
  { key: "overview", label: "Overview / Hospital Command Centre", icon: "grid_view", group: "flow" },
  { key: "reception", label: "OPD Reception", icon: "how_to_reg", group: "flow" },
  { key: "vitals", label: "Vitals Station", icon: "ecg_heart", group: "flow" },
  { key: "consultation", label: "Consultation Room", icon: "stethoscope", group: "flow" },
  { key: "laboratory", label: "Laboratory", icon: "chips", group: "flow" },
  { key: "pharmacy", label: "Pharmacy", icon: "prescriptions", group: "flow" },
  { key: "display", label: "Waiting TV Displays", icon: "connected_tv", group: "flow" },
  { key: "settings", label: "Hospital Flow Settings", icon: "tune", group: "admin" },
];

const ACTIVE_CLASSES =
  "bg-primary-container text-on-primary-container font-semibold shadow-[0_2px_8px_rgba(15,118,110,0.2)]";
const IDLE_CLASSES =
  "text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors";

function NavList({ view, onNavigate }: { view: ViewKey; onNavigate: (v: ViewKey) => void }) {
  return (
    <nav className="flex-1 px-space-sm py-space-xs space-y-1 overflow-y-auto no-scrollbar" aria-label="Modules">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onNavigate(v.key)}
          aria-current={view === v.key ? "page" : undefined}
          className={cn(
            "w-full text-left flex items-center gap-space-sm px-space-md py-space-sm rounded-lg font-label-lg text-label-lg transition-colors",
            view === v.key ? ACTIVE_CLASSES : IDLE_CLASSES
          )}
        >
          <span className="material-symbols-outlined text-[20px]">{v.icon}</span>
          {v.label}
        </button>
      ))}
      {VIEWS.filter((v) => v.group === "flow").length < VIEWS.length && (
        <div className="py-space-xs">
          <div className="h-px w-full bg-surface-variant" />
        </div>
      )}
    </nav>
  );
}

function StationSwitcher({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-full text-left bg-surface-container px-space-sm py-space-xs rounded-lg flex items-center justify-between hover:bg-surface-container-high transition-colors"
          aria-label="Switch active station"
        >
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[18px]">domain</span>
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface font-semibold">Main Maternity Wing</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Station: Triage Lead</span>
            </div>
          </div>
          <span className="material-symbols-outlined text-primary text-[20px]">sync_alt</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-on-surface-variant">Jump to station console</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onNavigate("reception")}>
          <span className="material-symbols-outlined text-[18px]">how_to_reg</span> OPD Reception Desk
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate("vitals")}>
          <span className="material-symbols-outlined text-[18px]">ecg_heart</span> Vitals &amp; Triage Bay
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate("consultation")}>
          <span className="material-symbols-outlined text-[18px]">stethoscope</span> Consultation Rooms
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate("laboratory")}>
          <span className="material-symbols-outlined text-[18px]">chips</span> Specimen Lab
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate("pharmacy")}>
          <span className="material-symbols-outlined text-[18px]">prescriptions</span> Pharmacy Window
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate("display")}>
          <span className="material-symbols-outlined text-[18px]">connected_tv</span> Waiting TV Display
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({
  view,
  onNavigate,
  wardCBedCapPct,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  wardCBedCapPct?: string;
}) {
  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-72 bg-surface-container-low z-50 flex-col justify-between shadow-[0_1px_12px_rgba(12,31,27,0.06)]">
      <div className="flex flex-col h-full">
        <div className="h-16 px-space-md flex items-center gap-space-sm bg-surface-container-low">
          <BrandBlock />
        </div>
        <div className="h-1 w-full chitenge-dots opacity-25" />
        <div className="px-space-md pt-space-md pb-space-xs">
          <StationSwitcher onNavigate={onNavigate} />
        </div>
        <NavList view={view} onNavigate={onNavigate} />
        <div className="p-space-md bg-surface-container-low">
          <div className="bg-surface-container rounded-lg p-space-sm flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface font-semibold">Shift Active</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Ward C • Bed Cap: {wardCBedCapPct ?? "92"}%
              </span>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ view, onNavigate }: { view: ViewKey; onNavigate: (v: ViewKey) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-on-surface-variant hover:text-on-surface"
          aria-label="Open navigation menu"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-surface-container-low p-0 w-72 border-0">
        <div className="flex flex-col h-full">
          <div className="h-16 px-space-md flex items-center bg-surface-container-low">
            <BrandBlock />
          </div>
          <div className="h-1 w-full chitenge-dots opacity-25" />
          <div className="px-space-md pt-space-md pb-space-xs">
            <StationSwitcher
              onNavigate={(v) => {
                onNavigate(v);
                setOpen(false);
              }}
            />
          </div>
          <NavList
            view={view}
            onNavigate={(v) => {
              onNavigate(v);
              setOpen(false);
            }}
          />
          <SheetTitle className="sr-only">Module navigation</SheetTitle>
        </div>
      </SheetContent>
    </Sheet>
  );
}
