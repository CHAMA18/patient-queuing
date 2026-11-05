// Moms Care Flow — patient journey domain logic

export const STAGES = [
  "REGISTRATION",
  "VITALS",
  "CONSULTATION",
  "LAB",
  "REVIEW",
  "PHARMACY",
  "COMPLETED",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<
  Stage,
  { label: string; short: string; icon: string; order: number; node: number }
> = {
  REGISTRATION: { label: "OPD Reception", short: "Reception", icon: "how_to_reg", order: 1, node: 1 },
  VITALS: { label: "Vitals & Triage", short: "Vitals", icon: "ecg_heart", order: 2, node: 2 },
  CONSULTATION: { label: "Doctor Consultation", short: "Consult", icon: "stethoscope", order: 3, node: 3 },
  LAB: { label: "Laboratory Diagnostic", short: "Lab", icon: "chips", order: 4, node: 4 },
  REVIEW: { label: "Doctor Review", short: "Review", icon: "clinical_notes", order: 5, node: 5 },
  PHARMACY: { label: "Pharmacy & Handover", short: "Pharmacy", icon: "prescriptions", order: 6, node: 6 },
  COMPLETED: { label: "Visit Completed", short: "Completed", icon: "task_alt", order: 7, node: 6 },
};

export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
}

export type LoadState = "SMOOTH" | "MODERATE" | "HIGH";

export function loadState(waiting: number): LoadState {
  if (waiting >= 7) return "HIGH";
  if (waiting >= 4) return "MODERATE";
  return "SMOOTH";
}

export const LOAD_META: Record<
  LoadState,
  { chip: string; badge: string; dot: string; ring: string; bar: string }
> = {
  SMOOTH: {
    chip: "Smooth",
    badge: "bg-surface-container text-primary",
    dot: "bg-primary",
    ring: "bg-primary text-on-primary",
    bar: "bg-primary",
  },
  MODERATE: {
    chip: "Moderate",
    badge: "bg-secondary-container text-on-secondary-container",
    dot: "bg-secondary",
    ring: "bg-secondary text-on-secondary",
    bar: "bg-secondary",
  },
  HIGH: {
    chip: "High Attention",
    badge: "bg-tertiary-fixed text-on-tertiary-fixed",
    dot: "bg-tertiary",
    ring: "bg-tertiary text-on-tertiary",
    bar: "bg-tertiary",
  },
};

export const PRIORITY_META: Record<string, { label: string; chip: string; dot: string; avatar: string }> = {
  ROUTINE: {
    label: "Routine",
    chip: "bg-surface-container text-primary",
    dot: "bg-primary",
    avatar: "bg-surface-container text-primary",
  },
  URGENT: {
    label: "Urgent",
    chip: "bg-secondary-container text-on-secondary-container",
    dot: "bg-secondary",
    avatar: "bg-secondary-container text-on-secondary-container",
  },
  RED: {
    label: "Priority Red",
    chip: "bg-error-container text-on-error-container",
    dot: "bg-error",
    avatar: "bg-tertiary-fixed text-on-tertiary-fixed",
  },
};

export const VISIT_TYPES = [
  "ANTENATAL",
  "POSTNATAL",
  "PAEDIATRIC",
  "ULTRASOUND",
  "GENERAL",
] as const;

export const VISIT_TYPE_META: Record<string, { label: string; hint: string }> = {
  ANTENATAL: { label: "Antenatal", hint: "ANC review / booking" },
  POSTNATAL: { label: "Postnatal", hint: "Mother & baby check" },
  PAEDIATRIC: { label: "Paediatric", hint: "Child wellness / illness" },
  ULTRASOUND: { label: "Ultrasound", hint: "Sonography bay" },
  GENERAL: { label: "General OPD", hint: "Maternity wing walk-in" },
};

export const LOUNGES = ["Lounge A", "Lounge B", "Lounge C"] as const;

export const ROOMS = [
  { id: "consult-01", label: "Room 01", name: "Consultation Room 01", doctor: "Dr. K. Mwape" },
  { id: "consult-02", label: "Room 02", name: "Consultation Room 02", doctor: "Dr. J. Banda" },
  { id: "consult-03", label: "Room 03", name: "Consultation Room 03", doctor: "Dr. J. Banda" },
  { id: "consult-04", label: "Room 04", name: "Consultation Room 04", doctor: "Dr. F. Phiri" },
  { id: "consult-05", label: "Room 05", name: "Consultation Room 05", doctor: "Dr. C. Zulu" },
] as const;

export const VITALS_BAYS = [
  { id: "vitals-1", label: "Vitals Bay 1" },
  { id: "vitals-2", label: "Vitals Bay 2" },
  { id: "vitals-3", label: "Vitals Bay 3" },
] as const;

export const LAB_BAYS = [
  { id: "lab-1", label: "Lab Bay 1" },
  { id: "lab-2", label: "Lab Bay 2 (Centrifuge 02)" },
] as const;

export const PHARM_WINDOWS = [
  { id: "pharm-1", label: "Dispensing Window 1" },
  { id: "pharm-2", label: "Dispensing Window 2" },
] as const;

export const LAB_PANELS = [
  "Complete Haemogram",
  "Urinalysis",
  "Blood Group & Rhesus",
  "Malaria RDT",
  "Random Blood Sugar",
  "Hb Level",
];

export function minutesSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
}

export function fmtWait(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}
