export const DEPARTMENTS = ["reception", "vitals", "consultation", "laboratory", "radiology", "pharmacy"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_HANDOFFS: Readonly<Record<Department, readonly Department[]>> = {
  reception: ["vitals"],
  vitals: ["consultation"],
  consultation: ["laboratory", "radiology", "pharmacy"],
  laboratory: ["consultation"],
  radiology: ["consultation"],
  pharmacy: [],
};

export const VISIT_COMPLETION_DEPARTMENTS: readonly Department[] = ["consultation", "pharmacy"];

export const ACCOUNT_ROLES = [
  "admin",
  "receptionist",
  "triage_nurse",
  "clinician",
  "lab_technician",
  "radiology_technician",
  "pharmacist",
  "pending_assignment",
] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const INVITABLE_ROLES = ["receptionist", "triage_nurse", "clinician", "lab_technician", "radiology_technician", "pharmacist"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_ASSIGNMENT_ROLES = ["admin", ...INVITABLE_ROLES] as const;
export type AssignableRole = (typeof ROLE_ASSIGNMENT_ROLES)[number];

export const DEPARTMENT_ROLES: Readonly<Record<Department, InvitableRole>> = {
  reception: "receptionist",
  vitals: "triage_nurse",
  consultation: "clinician",
  laboratory: "lab_technician",
  radiology: "radiology_technician",
  pharmacy: "pharmacist",
};

export const ROLE_HOME_SCREENS: Readonly<Record<AccountRole, string>> = {
  admin: "hospital-command-centre",
  receptionist: "opd-reception-patient-check-in",
  triage_nurse: "vitals-station",
  clinician: "consultation-room",
  lab_technician: "laboratory",
  radiology_technician: "radiology-ultrasound",
  pharmacist: "pharmacy",
  pending_assignment: "account-access-pending",
};

export const ACCOUNT_ROLE_DEFINITIONS: Readonly<Record<AccountRole, {
  label: string;
  description: string;
  department: Department | null;
}>> = {
  admin: {
    label: "Facility administrator",
    description: "Manage the facility, team access, operations, care stations, and patient displays.",
    department: null,
  },
  receptionist: {
    label: "Receptionist",
    description: "Register patients and manage the reception queue.",
    department: "reception",
  },
  triage_nurse: {
    label: "Vitals and triage nurse",
    description: "Review and manage patients in the vitals and triage queue.",
    department: "vitals",
  },
  clinician: {
    label: "Consultation clinician",
    description: "Manage patients moving through consultation.",
    department: "consultation",
  },
  lab_technician: {
    label: "Laboratory technician",
    description: "Manage the laboratory queue and its patient handoffs.",
    department: "laboratory",
  },
  radiology_technician: {
    label: "Radiology technician",
    description: "Manage patients receiving radiology and ultrasound scans.",
    department: "radiology",
  },
  pharmacist: {
    label: "Pharmacist",
    description: "Manage patients receiving pharmacy services.",
    department: "pharmacy",
  },
  pending_assignment: {
    label: "Role assignment needed",
    description: "No patient or facility content is available until an administrator assigns a role.",
    department: null,
  },
};

export function departmentForRole(role: AccountRole): Department | null {
  return role === "admin" || role === "pending_assignment"
    ? null
    : ACCOUNT_ROLE_DEFINITIONS[role].department;
}
