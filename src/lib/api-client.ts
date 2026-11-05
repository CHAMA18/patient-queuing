"use client";

// ---------- shared client types (JSON-serialised API payloads) ----------
export type Vitals = {
  id: string;
  patientId: string;
  systolic: number;
  diastolic: number;
  weightKg: number | null;
  tempC: number | null;
  pulseBpm: number | null;
  fetalBpm: number | null;
  notes: string | null;
  flagged: boolean;
  recordedBy: string | null;
  createdAt: string;
};

export type Prescription = {
  id: string;
  patientId: string;
  items: string; // JSON string [{drug,dose,freq,duration}]
  notes: string | null;
  prescribedBy: string | null;
  dispensed: boolean;
  dispensedAt: string | null;
  handedOverBy: string | null;
};

export type LabTest = {
  id: string;
  patientId: string;
  panel: string;
  status: "PENDING" | "PROCESSING" | "READY";
  orderedBy: string | null;
  resultSummary: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type Patient = {
  id: string;
  ticket: string;
  name: string;
  age: number | null;
  phone: string | null;
  address: string | null;
  visitType: string;
  trimester: string | null;
  gestationWk: number | null;
  lounge: string | null;
  seat: string | null;
  priority: "ROUTINE" | "URGENT" | "RED";
  stage: string;
  status: "WAITING" | "IN_SERVICE" | "COMPLETED";
  roomId: string | null;
  stageEnteredAt: string;
  fastTracked: boolean;
  registeredBy: string | null;
  completedAt: string | null;
  createdAt: string;
  vitals: Vitals | null;
  prescription: Prescription | null;
  labTests: LabTest[];
};

export type AlertItem = {
  id: string;
  kind: "triage" | "centrifuge" | "overrun" | "escalation";
  severity: "HIGH" | "MEDIUM";
  title: string;
  chip: string;
  body: string;
  meta: string[];
  patientId?: string;
  eventId?: string;
  roomId?: string;
  actionLabel: string;
  secondaryLabel?: string;
};

export type FlowNode = {
  stage: string;
  node: number;
  label: string;
  sub: string;
  rate: number;
  rateUnit: string;
  util: number;
  waiting: number;
  inService: number;
  staff: number;
  staffLabel: string;
  longestWait: number;
  state: "SMOOTH" | "MODERATE" | "HIGH";
};

export type FeedItem = {
  id: string;
  ticket: string | null;
  type: string;
  title: string;
  detail: string | null;
  tag: string | null;
  extra: string | null;
  gate: string | null;
  at: string;
};

export type DashboardData = {
  kpis: {
    registeredToday: number;
    waiting: number;
    attended: number;
    completed: number;
    avgWaitMin: number;
    targetWaitMin: number;
    longestQueue: { stage: string; label: string; mins: number };
    wardOccupancyPct: number;
  };
  nodes: FlowNode[];
  alerts: AlertItem[];
  feed: FeedItem[];
  eventCount: number;
  loungeLoad: Array<{ lounge: string; waiting: number }>;
  settings: Record<string, string>;
  journeyVelocity: string;
};

export type DisplayData = {
  nowServing: Array<{ room: string; label: string; ticket: string; name: string; since: string; stage: string }>;
  queues: Record<string, { stage: string; label: string; waiting: number; next: string[] }>;
  settings: { hospitalName?: string; wing?: string; wardOccupancyPct?: string; overflowOpen?: boolean };
};

export type StaffMember = {
  id: string;
  name: string;
  role: string;
  station: string;
  room: string | null;
  active: boolean;
};

export type SettingsData = {
  settings: Record<string, string>;
  staff: StaffMember[];
};

export type AuditEvent = {
  id: string;
  ticket: string | null;
  type: string;
  title: string;
  detail: string | null;
  meta: string | null;
  createdAt: string;
  patient: { name: string; stage: string; status: string } | null;
};

// ---------- fetch helper ----------
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const postJson = <T,>(url: string, body: unknown) =>
  api<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const patchJson = <T,>(url: string, body: unknown) =>
  api<T>(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
