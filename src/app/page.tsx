"use client";

import { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, postJson, type DashboardData } from "@/lib/api-client";
import { useQueueSocket } from "@/hooks/use-queue-socket";
import { Sidebar, type ViewKey } from "@/components/mcf/sidebar";
import { Header } from "@/components/mcf/header";
import { OverviewView, AuditDialog } from "@/components/mcf/overview";
import { ReceptionView } from "@/components/mcf/reception";
import { VitalsView } from "@/components/mcf/vitals";
import { ConsultationView } from "@/components/mcf/consultation";
import { LaboratoryView } from "@/components/mcf/laboratory";
import { PharmacyView } from "@/components/mcf/pharmacy";
import { DisplayView } from "@/components/mcf/display";
import { SettingsView } from "@/components/mcf/settings";
import { useToast } from "@/hooks/use-toast";

const VALID_VIEWS: ViewKey[] = ["overview", "reception", "vitals", "consultation", "laboratory", "pharmacy", "display", "settings"];

function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewKey>("overview");
  const [auditOpen, setAuditOpen] = useState(false);

  // hash-based routing so refreshes and TV-screen tabs keep their module
  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash.replace("#", "") as ViewKey;
      if (VALID_VIEWS.includes(h)) setView(h);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const navigate = useCallback((v: ViewKey) => {
    setView(v);
    if (typeof window !== "undefined") window.location.hash = v;
    window.scrollTo({ top: 0 });
  }, []);

  // central dashboard payload (KPIs feed header alerts; stations fetch their own queues)
  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
    refetchInterval: 10000,
  });

  // live socket → invalidate everything instantly on any queue mutation
  const onSocketUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["patients"] });
    queryClient.invalidateQueries({ queryKey: ["patients-today"] });
    queryClient.invalidateQueries({ queryKey: ["display"] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  }, [queryClient]);
  useQueueSocket(onSocketUpdate);

  const alerts = dashboard?.alerts ?? [];
  const settings = dashboard?.settings ?? {};

  const onAlertAction = useCallback(
    async (a: (typeof alerts)[number], which: "primary" | "secondary") => {
      try {
        if (a.kind === "triage") {
          await postJson("/api/actions", { action: "fast-track", patientId: a.patientId });
          toast({ title: "Fast-tracked to Room 01", description: "Priority Red patient expedited." });
        } else if (a.kind === "centrifuge") {
          await postJson("/api/actions", which === "primary"
            ? { action: "route-satellite", eventId: a.eventId }
            : { action: "resolve-alert", eventId: a.eventId });
          toast({ title: "Lab bottleneck handled" });
        } else if (a.kind === "overrun") {
          await postJson("/api/actions", which === "primary"
            ? { action: "split-queue", roomId: a.roomId }
            : { action: "broadcast", message: "Consultation overrun — queue rebalanced by command centre." });
          toast({ title: "Waiting queue rebalanced" });
        } else {
          await postJson("/api/actions", { action: "resolve-alert", eventId: a.eventId });
          toast({ title: "Escalation resolved" });
        }
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (e) {
        toast({ title: "Action failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
      }
    },
    [toast, queryClient]
  );

  if (view === "display") {
    return <DisplayView onExit={() => navigate("overview")} />;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar view={view} onNavigate={navigate} wardCBedCapPct={settings.wardCBedCapPct} />
      <div className="flex-1 lg:pl-72 min-w-0">
        <Header view={view} onNavigate={navigate} alerts={alerts} onAlertAction={onAlertAction} settings={settings} />
        <main className="w-full pt-16 bg-background min-h-screen px-4 lg:px-space-lg py-space-lg">
          {view === "overview" && (
            <OverviewView data={dashboard} isLoading={dashLoading} onOpenAudit={() => setAuditOpen(true)} />
          )}
          {view === "reception" && <ReceptionView />}
          {view === "vitals" && <VitalsView />}
          {view === "consultation" && <ConsultationView />}
          {view === "laboratory" && <LaboratoryView />}
          {view === "pharmacy" && <PharmacyView />}
          {view === "settings" && <SettingsView />}
        </main>
        <AuditDialog open={auditOpen} onOpenChange={setAuditOpen} />
      </div>
    </div>
  );
}

export default function Page() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5000, refetchOnWindowFocus: true, retry: 2 },
        },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
