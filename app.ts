import { mountAuth, type AuthMode, type AuthUser, type AuthenticatedResult } from "./auth";
import { apiRequest } from "./api-client";
import { ACCOUNT_ROLE_DEFINITIONS, ACCOUNT_ROLES, DEPARTMENTS, DEPARTMENT_HANDOFFS, INVITABLE_ROLES, ROLE_ASSIGNMENT_ROLES, ROLE_HOME_SCREENS, VISIT_COMPLETION_DEPARTMENTS, departmentForRole, type AccountRole, type AssignableRole, type Department, type InvitableRole } from "./roles";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

interface StitchScreen {
  readonly slug: string;
  readonly title: string;
  readonly category: "Operations" | "Administration" | "Settings" | "Clinical Workstations" | "Patient-Facing Displays" | "Account";
  readonly description: string;
}

const screens = [
  { slug: "hospital-command-centre", title: "Hospital Command Centre", category: "Operations", description: "A live view of arrivals, active care and team communication." },
  { slug: "admin-panel", title: "Admin", category: "Administration", description: "Manage team access, facility settings and patient flow." },
  { slug: "facility-operations-command-center", title: "Facility Operations", category: "Operations", description: "See how patient flow is moving across your facility." },
  { slug: "queue-configuration-studio", title: "Queue Configuration", category: "Settings", description: "Set service targets for each department." },
  { slug: "hospital-flow-settings", title: "Flow Settings", category: "Settings", description: "Manage facility preferences and secure team access." },
  { slug: "system-settings", title: "System Settings", category: "Settings", description: "Review your workspace and configure patient displays across connected monitors." },
  { slug: "account-access-pending", title: "Access pending", category: "Account", description: "Your facility administrator needs to assign your care team access." },
  { slug: "opd-reception-patient-check-in", title: "OPD Reception", category: "Clinical Workstations", description: "Register a patient and create a live queue ticket." },
  { slug: "vitals-station", title: "Vitals Station", category: "Clinical Workstations", description: "Coordinate the active vitals and triage queue." },
  { slug: "consultation-room", title: "Consultation Room", category: "Clinical Workstations", description: "Coordinate patients through consultation." },
  { slug: "laboratory", title: "Laboratory", category: "Clinical Workstations", description: "Coordinate patients through the laboratory queue." },
  { slug: "radiology-ultrasound", title: "Radiology and ultrasound Scan", category: "Clinical Workstations", description: "Coordinate patients through radiology and ultrasound scans." },
  { slug: "pharmacy", title: "Pharmacy", category: "Clinical Workstations", description: "Coordinate patients through the pharmacy queue." },
  { slug: "patient-display", title: "Patient Display", category: "Patient-Facing Displays", description: "Open and manage the available patient-facing screens." },
  { slug: "waiting-tv-displays", title: "Waiting Displays", category: "Patient-Facing Displays", description: "Review privacy-safe waiting display status." },
  { slug: "audio-announcement-broadcast-tv-display", title: "Ward Announcements", category: "Patient-Facing Displays", description: "A privacy-safe live call board for public display." },
  { slug: "vitals-waiting-area-tv-display", title: "Antenatal Triage Display", category: "Patient-Facing Displays", description: "A privacy-safe live call board for the vitals area." },
  { slug: "main-waiting-area-tv-display", title: "Main Waiting Area Display", category: "Patient-Facing Displays", description: "A privacy-safe live call board for Reception, Vitals and Triage, Consultation, Laboratory, Radiology and ultrasound Scan, and Pharmacy." },
] as const satisfies readonly StitchScreen[];

type ScreenSlug = (typeof screens)[number]["slug"];
type PublicDisplaySlug = Extract<ScreenSlug, "audio-announcement-broadcast-tv-display" | "vitals-waiting-area-tv-display" | "main-waiting-area-tv-display">;
type QueueStatus = "waiting" | "called" | "in_progress" | "completed" | "cancelled";
type ThemeMode = "light" | "dark";

interface PublicDisplayCopy {
  eyebrow: string;
  headline: string;
  body: string;
}

type PublicDisplayContent = Partial<Record<PublicDisplaySlug, PublicDisplayCopy>>;

interface DisplayAdvert {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  enabled: boolean;
}

interface DisplayService {
  id: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
}

interface DisplayTeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  photoUrl: string;
  enabled: boolean;
}

interface DisplayAnnouncement {
  id: string;
  body: string;
  enabled: boolean;
}

interface PatientDisplayLibrary {
  adverts: DisplayAdvert[];
  services: DisplayService[];
  teamMembers: DisplayTeamMember[];
  announcements: DisplayAnnouncement[];
}

type PatientDisplayItem = DisplayAdvert | DisplayService | DisplayTeamMember | DisplayAnnouncement;

interface QueueEntry {
  id: string;
  ticketNumber: string;
  department: Department;
  status: QueueStatus;
  priority: "standard" | "priority" | "urgent";
  reason: string;
  checkedInAt: string;
  calledAt?: string | null;
  startedAt?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  waitMinutes: number;
}

interface StaffMember {
  id: string;
  fullName: string;
  jobTitle: string;
  accountRole: AccountRole;
}

interface FacilityInviteCode {
  id: string;
  accountRole: AccountRole;
  createdAt: string;
  createdByName?: string | null;
}

interface Overview {
  checkedInToday: number;
  waiting: number;
  called: number;
  inProgress: number;
  completedToday: number;
  averageWaitMinutes: number;
}

interface DepartmentStats {
  department: Department;
  active: number;
  waiting: number;
  inProgress: number;
  servedToday?: number;
  averageWaitMinutes?: number | null;
  averageServiceMinutes?: number | null;
}

interface DashboardData {
  overview: Overview;
  departments: DepartmentStats[];
  queue: QueueEntry[];
}

interface QueuePage {
  queue: QueueEntry[];
  total: number;
  limit: number;
  offset: number;
  waiting: number;
  called: number;
  inProgress: number;
  longestWaitMinutes: number;
}

interface Facility {
  id: string;
  name: string;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: string;
  staffCount: number;
}

interface ManagedScreen {
  label?: string;
  isPrimary: boolean;
  isInternal?: boolean;
  left?: number;
  top?: number;
  width: number;
  height: number;
  availLeft?: number;
  availTop?: number;
  availWidth: number;
  availHeight: number;
  devicePixelRatio?: number;
}

interface ManagedScreenDetails extends EventTarget {
  screens: ManagedScreen[];
}

interface WindowWithManagedScreens extends Window {
  getScreenDetails?: () => Promise<ManagedScreenDetails>;
}

interface ScreenWithExtended extends Screen {
  isExtended?: boolean;
}

type MonitorDetectionState =
  | { kind: "not-scanned" }
  | { kind: "detected"; details: ManagedScreenDetails }
  | { kind: "unsupported"; extended: boolean | null }
  | { kind: "denied"; message: string };

const departmentOrder: readonly Department[] = DEPARTMENTS;
const departmentScreenSlugs: Record<Department, ScreenSlug> = {
  reception: "opd-reception-patient-check-in",
  vitals: "vitals-station",
  consultation: "consultation-room",
  laboratory: "laboratory",
  radiology: "radiology-ultrasound",
  pharmacy: "pharmacy",
};
const publicDisplaySlugs: readonly PublicDisplaySlug[] = [
  "audio-announcement-broadcast-tv-display",
  "vitals-waiting-area-tv-display",
  "main-waiting-area-tv-display",
];
const patientDisplayOptionSlugs = [
  "waiting-tv-displays",
  ...publicDisplaySlugs,
] as const satisfies readonly ScreenSlug[];
const departmentLabels: Record<Department, string> = {
  reception: "Reception",
  vitals: "Vitals and Triage",
  consultation: "Consultation",
  laboratory: "Laboratory",
  radiology: "Radiology and ultrasound Scan",
  pharmacy: "Pharmacy",
};
const departmentIcons: Record<Department, string> = {
  reception: "how_to_reg", vitals: "ecg_heart", consultation: "stethoscope", laboratory: "biotech", radiology: "radiology", pharmacy: "medication",
};
const sidebarIcons: Record<ScreenSlug, string> = {
  "hospital-command-centre": "space_dashboard",
  "admin-panel": "admin_panel_settings",
  "facility-operations-command-center": "monitoring",
  "queue-configuration-studio": "tune",
  "hospital-flow-settings": "settings",
  "system-settings": "settings_suggest",
  "account-access-pending": "pending_actions",
  "opd-reception-patient-check-in": "how_to_reg",
  "vitals-station": "ecg_heart",
  "consultation-room": "stethoscope",
  laboratory: "biotech",
  "radiology-ultrasound": "radiology",
  pharmacy: "medication",
  "patient-display": "view_list",
  "waiting-tv-displays": "connected_tv",
  "audio-announcement-broadcast-tv-display": "campaign",
  "vitals-waiting-area-tv-display": "pregnant_woman",
  "main-waiting-area-tv-display": "tv",
};
const sidebarLabels: Record<ScreenSlug, string> = {
  "hospital-command-centre": "Hospital Dashboard",
  "admin-panel": "Admin",
  "facility-operations-command-center": "Facility Overview",
  "queue-configuration-studio": "Queue Settings",
  "hospital-flow-settings": "Facility Settings",
  "system-settings": "System Settings",
  "account-access-pending": "Access pending",
  "opd-reception-patient-check-in": "Reception",
  "vitals-station": "Vitals and Triage",
  "consultation-room": "Consultation",
  laboratory: "Laboratory",
  "radiology-ultrasound": "Radiology and ultrasound Scan",
  pharmacy: "Pharmacy",
  "patient-display": "Patient Display",
  "waiting-tv-displays": "Waiting Room Display",
  "audio-announcement-broadcast-tv-display": "Ward Display",
  "vitals-waiting-area-tv-display": "Maternity Waiting Room Display",
  "main-waiting-area-tv-display": "Main Waiting Room Display",
};
const sidebarCategoryLabels: Record<(typeof screens)[number]["category"], string> = {
  Operations: "Overview",
  Administration: "Administration",
  Settings: "Settings",
  "Clinical Workstations": "Care Team",
  "Patient-Facing Displays": "Patient Displays",
  Account: "Account",
};

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}

const authRoot = requireElement<HTMLElement>("#auth-root");
const workspaceShell = requireElement<HTMLDivElement>("#workspace-shell");
const workspaceNav = requireElement<HTMLElement>("#workspace-nav");
const sidebarToggle = requireElement<HTMLButtonElement>("#sidebar-toggle");
const sidebarToggleIcon = requireElement<HTMLElement>("#sidebar-toggle-icon");
const themeToggle = requireElement<HTMLButtonElement>("#theme-toggle");
const themeIcon = requireElement<HTMLElement>("#theme-icon");
const themeModeLabel = requireElement<HTMLElement>("#theme-mode-label");
const logoutButton = requireElement<HTMLButtonElement>("#logout-button");
const screenRoot = requireElement<HTMLElement>("#screen-root");
const appBoot = document.querySelector<HTMLElement>("#app-boot");
let activeScreenSlug: ScreenSlug = "hospital-command-centre";
let activeTheme: ThemeMode = readThemePreference();
let sidebarCollapsed = readSidebarPreference();
let currentUser: AuthUser | null = null;
let currentPatientDisplayLibrary: PatientDisplayLibrary | null = null;
let toastTimer = 0;
let liveRefreshTimer = 0;
let silentRefreshInFlight = false;
let monitorDetection: MonitorDetectionState = { kind: "not-scanned" };
let watchedMonitorDetails: ManagedScreenDetails | null = null;
let monitorChangeHandler: (() => void) | null = null;
const publicDisplaySoundPreferenceKey = "mums-care-public-display-sound";
let publicDisplaySoundEnabled = readPublicDisplaySoundPreference();
let publicDisplayAudioContext: AudioContext | null = null;
let publicDisplayMarqueePaused = false;
let publicDisplayMarqueeStartedAt = Date.now();
let publicDisplayMarqueePausedAt: number | null = null;
let publicDisplayMarqueeTotalPausedMs = 0;
let lastPublicCallDisplaySlug: PublicDisplaySlug | null = null;
let lastPublicCalledKey: string | null | undefined;
const queuePageOffsets = new Map<Department, number>();
const intendedScreenKey = "mums-care-intended-screen";

function readPublicDisplaySoundPreference(): boolean {
  try { return localStorage.getItem(publicDisplaySoundPreferenceKey) === "enabled"; }
  catch { return false; }
}

function resumePublicDisplayAudio(): void {
  if (!publicDisplaySoundEnabled || typeof window.AudioContext === "undefined") return;
  try {
    publicDisplayAudioContext ??= new AudioContext();
    if (publicDisplayAudioContext.state !== "running") void publicDisplayAudioContext.resume().catch(() => {});
  } catch { /* Browser audio can remain unavailable without affecting the live display. */ }
}

document.addEventListener("pointerdown", resumePublicDisplayAudio, true);
document.addEventListener("keydown", resumePublicDisplayAudio, true);

function updatePublicDisplayFullscreenButton(): void {
  const button = screenRoot.querySelector<HTMLButtonElement>("[data-display-fullscreen]");
  if (!button) return;
  const isFullscreen = document.fullscreenElement === workspaceShell;
  const label = isFullscreen ? "Exit full screen" : "Extend to full screen";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(isFullscreen));
  button.title = label;
  const icon = button.querySelector<HTMLElement>(".material-symbols-outlined");
  if (icon) icon.textContent = isFullscreen ? "fullscreen_exit" : "fullscreen";
  const text = button.querySelector<HTMLElement>(".display-fullscreen-label");
  if (text) text.textContent = label;
}

document.addEventListener("fullscreenchange", updatePublicDisplayFullscreenButton);

function readThemePreference(): ThemeMode {
  try {
    const saved = localStorage.getItem("mums-care-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Theme remains available for the current session. */ }
  return "light";
}

function readSidebarPreference(): boolean {
  try { return localStorage.getItem("mums-care-sidebar-collapsed") === "true"; }
  catch { return false; }
}

function applySidebarState(collapsed: boolean): void {
  sidebarCollapsed = collapsed;
  workspaceShell.classList.toggle("is-sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} sidebar`);
  sidebarToggle.title = `${collapsed ? "Expand" : "Collapse"} sidebar`;
  sidebarToggleIcon.textContent = collapsed ? "left_panel_open" : "left_panel_close";
  try { localStorage.setItem("mums-care-sidebar-collapsed", String(collapsed)); }
  catch { /* Keep the current layout for this session. */ }
}

function applyTheme(theme: ThemeMode): void {
  activeTheme = theme;
  document.documentElement.dataset.theme = theme;
  workspaceShell.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  themeToggle.title = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  themeModeLabel.textContent = `${theme === "dark" ? "Dark" : "Light"} mode`;
  themeIcon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
  try { localStorage.setItem("mums-care-theme", theme); } catch { /* Keep current theme in memory. */ }
}

function isScreenSlug(value: string | null): value is ScreenSlug {
  return screens.some((screen) => screen.slug === value);
}

function isPublicDisplayScreen(slug: ScreenSlug): slug is PublicDisplaySlug {
  return publicDisplaySlugs.includes(slug as PublicDisplaySlug);
}

function screenHref(slug: ScreenSlug): string {
  const url = new URL(location.href);
  url.searchParams.delete("auth");
  url.searchParams.delete("view");
  if (slug !== "admin-panel") url.searchParams.delete("adminTab");
  url.searchParams.delete("display");
  url.searchParams.set("screen", slug);
  return `${url.pathname}${url.search}`;
}

function authModeFromUrl(): AuthMode | null {
  const value = new URL(location.href).searchParams.get("auth");
  return value === "login" || value === "register" ? value : null;
}

function setUserChrome(user: AuthUser): void {
  const footer = workspaceShell.querySelector<HTMLElement>(".workspace-sidebar-footer");
  if (footer) {
    footer.innerHTML = `<span class="workspace-footer-mark">${escapeHtml(initials(user.fullName))}</span><span><strong>${escapeHtml(user.fullName)}</strong><small>${escapeHtml(user.facilityName)} · ${escapeHtml(ACCOUNT_ROLE_DEFINITIONS[user.accountRole].label)}</small></span>`;
  }
  populateWorkspaceNavigation();
}

function populateWorkspaceNavigation(): void {
  workspaceNav.replaceChildren();
  const homeScreen = currentUser ? defaultScreenForRole(currentUser.accountRole) : "hospital-command-centre";
  const brandLink = workspaceShell.querySelector<HTMLAnchorElement>(".workspace-brand");
  if (brandLink) {
    brandLink.href = screenHref(homeScreen);
    brandLink.dataset.screen = homeScreen;
    brandLink.setAttribute("aria-label", `Mum’s Care ${screens.find((screen) => screen.slug === homeScreen)?.title ?? "workspace"}`);
  }
  const availableScreens = currentUser ? screensForRole(currentUser.accountRole) : [...screens];
  const categories = [...new Set(availableScreens.map((screen) => screen.category))];
  const settingsCategoryIndex = categories.indexOf("Settings");
  if (settingsCategoryIndex !== -1) categories.push(...categories.splice(settingsCategoryIndex, 1));
  for (const category of categories) {
    const group = document.createElement("section");
    group.className = "workspace-nav-group";
    const heading = document.createElement("h2");
    heading.className = "workspace-nav-heading";
    heading.textContent = sidebarCategoryLabels[category];
    group.append(heading);
    for (const screen of availableScreens.filter((entry) => entry.category === category && (category !== "Patient-Facing Displays" || entry.slug === "patient-display"))) {
      const link = document.createElement("a");
      link.className = "workspace-nav-link";
      link.dataset.screen = screen.slug;
      link.href = screenHref(screen.slug);
      const labelText = sidebarLabels[screen.slug];
      link.title = labelText;
      link.setAttribute("aria-label", labelText);
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = sidebarIcons[screen.slug];
      const label = document.createElement("span");
      label.className = "workspace-nav-label";
      label.textContent = labelText;
      link.append(icon, label);
      group.append(link);
    }
    workspaceNav.append(group);
  }
}

function screensForRole(role: AccountRole) {
  if (role === "admin") return screens.filter((screen) => screen.slug !== "account-access-pending");
  const homeScreen = ROLE_HOME_SCREENS[role];
  return screens.filter((screen) => screen.slug === homeScreen);
}

function canAccessScreen(role: AccountRole, slug: ScreenSlug): boolean {
  return screensForRole(role).some((screen) => screen.slug === slug);
}

function defaultScreenForRole(role: AccountRole): ScreenSlug {
  const slug = ROLE_HOME_SCREENS[role];
  return isScreenSlug(slug) ? slug : "account-access-pending";
}

function updateNavigation(slug: ScreenSlug): void {
  const activeSlug = patientDisplayOptionSlugs.includes(slug as (typeof patientDisplayOptionSlugs)[number]) ? "patient-display" : slug;
  for (const link of workspaceNav.querySelectorAll<HTMLAnchorElement>("a[data-screen]")) {
    if (link.dataset.screen === activeSlug) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const activeLink = workspaceNav.querySelector<HTMLAnchorElement>('a[data-screen][aria-current="page"]');
  if (!activeLink) return;
  workspaceNav.scrollTop = 0;
  const navBox = workspaceNav.getBoundingClientRect();
  const linkBox = activeLink.getBoundingClientRect();
  if (linkBox.top < navBox.top) workspaceNav.scrollTop -= navBox.top - linkBox.top;
  else if (linkBox.bottom > navBox.bottom) workspaceNav.scrollTop += linkBox.bottom - navBox.bottom;
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  return apiRequest<T>(url, init);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "MC";
}

function formatDate(value: string | Date | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDepartment(value: string): string {
  return departmentLabels[value as Department] ?? value.replaceAll("_", " ");
}

function formatWait(minutes: unknown): { short: string; title: string; aria: string; tone: "quiet" | "watch" | "long" } {
  const total = Math.max(0, Math.round(numberValue(minutes)));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const short = days > 0
    ? `${days} d ${hours} h`
    : hours > 0
      ? (mins > 0 ? `${hours} h ${mins} m` : `${hours} h`)
      : total > 0 ? `${mins} min` : "Just now";
  const spoken: string[] = [];
  if (days) spoken.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) spoken.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (!days && mins) spoken.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return {
    short,
    title: `${total.toLocaleString("en-ZM")} ${total === 1 ? "minute" : "minutes"} in this queue`,
    aria: `Waiting ${spoken.length ? spoken.join(" ") : "less than a minute"}`,
    tone: total >= 180 ? "long" : total >= 60 ? "watch" : "quiet",
  };
}

function pageHeading(screen: StitchScreen, tag = "CARE FLOW"): string {
  if (screen.slug === "hospital-command-centre") return "";
  return `<div class="page-heading"><div><div class="page-kicker"><span></span>${escapeHtml(tag)}</div><h1>${escapeHtml(screen.title)}</h1><p>${escapeHtml(screen.description)}</p></div><div class="page-heading-actions"><button class="icon-action" type="button" data-refresh aria-label="Refresh data" title="Refresh data"><span class="material-symbols-outlined" aria-hidden="true">refresh</span></button></div></div>`;
}

function screenPageHeading(screen: StitchScreen): string {
  return screen.slug === "hospital-command-centre" ? "" : pageHeading(screen);
}

function metric(label: string, value: number | string, icon: string, tint: string, note: string): string {
  return `<article class="metric-card metric-${tint}"><div class="metric-card-top"><span>${escapeHtml(label)}</span><span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(icon)}</span></div><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function emptyState(title: string, detail: string, icon = "inbox"): string {
  return `<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(icon)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function priorityTag(priority: QueueEntry["priority"]): string {
  const label = priority === "standard" ? "Standard" : priority === "priority" ? "Priority" : "Urgent";
  return `<span class="priority-tag priority-${priority}">${label}</span>`;
}

function statusTag(status: QueueStatus): string {
  const label: Record<QueueStatus, string> = { waiting: "Waiting", called: "Called", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
  return `<span class="status-tag status-${status}"><i aria-hidden="true"></i>${label[status]}</span>`;
}

function queueRow(entry: QueueEntry, staff: StaffMember[], options: { showDepartment?: boolean; actions?: boolean } = {}): string {
  const eligibleStaff = staff.filter((member) => member.accountRole === "admin" || departmentForRole(member.accountRole) === entry.department);
  const nextDepartments = currentUser?.accountRole === "admin"
    ? departmentOrder.filter((department) => department !== entry.department)
    : DEPARTMENT_HANDOFFS[entry.department];
  const canCompleteVisit = currentUser?.accountRole === "admin" || VISIT_COMPLETION_DEPARTMENTS.includes(entry.department);
  const wait = formatWait(entry.waitMinutes);
  const assignControl = eligibleStaff.length > 0
    ? `<select class="assign-select${entry.assignedUserId ? " is-assigned" : ""}" data-assign-entry="${escapeHtml(entry.id)}" aria-label="Assign ticket ${escapeHtml(entry.ticketNumber)} to a care team member"><option value="">Unassigned</option>${eligibleStaff.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === entry.assignedUserId ? "selected" : ""}>${escapeHtml(member.fullName)} · ${escapeHtml(ACCOUNT_ROLE_DEFINITIONS[member.accountRole].label)}</option>`).join("")}</select>`
    : `<span class="queue-assign is-empty" aria-hidden="true"></span>`;
  const completeControl = entry.status === "in_progress" && canCompleteVisit
    ? `<button class="button button-small button-quiet queue-action-complete" data-queue-action="complete" data-entry-id="${escapeHtml(entry.id)}" aria-label="Complete visit for ticket ${escapeHtml(entry.ticketNumber)}" title="Complete visit"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span><span class="queue-action-complete-label">Complete visit</span></button>`
    : `<span class="queue-action-complete is-empty" aria-hidden="true"></span>`;
  const controls = options.actions === false ? "" : `<div class="queue-actions">
    <div class="queue-action-primary">
      ${entry.status === "waiting" ? `<button class="button button-small button-primary" data-queue-action="call" data-entry-id="${escapeHtml(entry.id)}" aria-label="Call ticket ${escapeHtml(entry.ticketNumber)}"><span class="material-symbols-outlined" aria-hidden="true">record_voice_over</span>Call</button>` : ""}
      ${entry.status === "called" ? `<button class="button button-small button-primary" data-queue-action="start" data-entry-id="${escapeHtml(entry.id)}" aria-label="Start ticket ${escapeHtml(entry.ticketNumber)}"><span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>Start</button>` : ""}
      ${entry.status === "in_progress" && nextDepartments.length ? `<div class="move-control"><select aria-label="Next department for ticket ${escapeHtml(entry.ticketNumber)}" data-next-department="${escapeHtml(entry.id)}"><option value="">Next step…</option>${nextDepartments.map((department) => `<option value="${department}">${escapeHtml(departmentLabels[department])}</option>`).join("")}</select><button class="button button-small button-secondary" data-queue-action="advance" data-entry-id="${escapeHtml(entry.id)}" aria-label="Move ticket ${escapeHtml(entry.ticketNumber)} to the selected department"><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>Move</button></div>` : ""}
    </div>
    ${completeControl}
    ${assignControl}
  </div>`;
  return `<article class="queue-row" role="listitem" data-status="${entry.status}"><div class="queue-person"><span class="queue-avatar" aria-hidden="true">${escapeHtml(initials(`${entry.firstName} ${entry.lastName}`))}</span><div><strong>${escapeHtml(entry.firstName)} ${escapeHtml(entry.lastName)}</strong><small><span class="queue-ticket">${escapeHtml(entry.ticketNumber)}</span>${options.showDepartment ? `<span class="queue-ticket-divider" aria-hidden="true">·</span>${escapeHtml(formatDepartment(entry.department))}` : ""}</small></div></div><div class="queue-meta"><span class="queue-wait queue-wait-${wait.tone}" title="${escapeHtml(wait.title)}" aria-label="${escapeHtml(wait.aria)}"><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${escapeHtml(wait.short)}</span>${priorityTag(entry.priority)}${statusTag(entry.status)}</div>${controls}</article>`;
}

function queuePanel(title: string, entries: QueueEntry[], staff: StaffMember[], options: { showDepartment?: boolean; actions?: boolean; detail?: string; metricCard?: boolean; live?: boolean; total?: number; workstation?: boolean } = {}): string {
  return `<section class="panel${options.metricCard ? " active-patient-flow-card" : ""}${options.workstation ? " queue-panel-workstation" : ""}"><div class="panel-heading"><div><h2>${escapeHtml(title)}</h2>${options.detail ? `<p>${escapeHtml(options.detail)}</p>` : ""}</div><div class="panel-heading-meta">${options.live ? `<span class="live-pill"><i></i> LIVE</span>` : ""}<span class="panel-count">${options.total ?? entries.length}</span></div></div>${entries.length ? `<div class="queue-list" role="list">${entries.map((entry) => queueRow(entry, staff, options)).join("")}</div>` : emptyState("No patients in this queue", "New check-ins will appear here as soon as they are registered.")}</section>`;
}

function queuePager(page: QueuePage, department: Department): string {
  const first = page.total ? page.offset + 1 : 0;
  const last = Math.min(page.offset + page.queue.length, page.total);
  const previousOffset = Math.max(0, page.offset - page.limit);
  const nextOffset = page.offset + page.limit;
  return `<nav class="queue-pagination" aria-label="Queue pages"><span class="queue-page-summary" role="status" aria-live="polite" tabindex="-1">Showing ${first}–${last} of ${page.total} active ${page.total === 1 ? "visit" : "visits"}</span>${page.total > page.limit ? `<div><button class="button button-secondary button-small" type="button" data-queue-department="${department}" data-queue-offset="${previousOffset}" ${page.offset === 0 ? "disabled" : ""} aria-label="Previous page of ${departmentLabels[department]} queue">Previous</button><button class="button button-secondary button-small" type="button" data-queue-department="${department}" data-queue-offset="${nextOffset}" ${nextOffset >= page.total ? "disabled" : ""} aria-label="Next page of ${departmentLabels[department]} queue">Next</button></div>` : ""}</nav>`;
}

function departmentCard(stats: DepartmentStats | undefined, department: Department): string {
  const active = Number(stats?.active ?? 0);
  const waiting = Number(stats?.waiting ?? 0);
  const progress = Number(stats?.inProgress ?? 0);
  const slug = departmentScreenSlugs[department];
  return `<a class="department-card" href="${screenHref(slug)}" data-screen="${slug}" data-department="${department}"><span class="department-icon material-symbols-outlined" aria-hidden="true">${departmentIcons[department]}</span><span class="department-card-copy"><strong>${escapeHtml(departmentLabels[department])}</strong><small>${waiting} waiting · ${progress} in service</small></span><span class="department-total">${active}</span><span class="material-symbols-outlined department-arrow" aria-hidden="true">arrow_outward</span></a>`;
}

function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

async function loadDashboard(): Promise<DashboardData> {
  return api<DashboardData>("/api/dashboard");
}

async function loadFacility(): Promise<Facility> {
  const result = await api<{ facility: Facility }>("/api/facility");
  return result.facility;
}

async function loadStaff(): Promise<StaffMember[]> {
  const result = await api<{ staff: StaffMember[] }>("/api/staff");
  return result.staff;
}

async function loadQueue(department: Department): Promise<QueuePage> {
  const offset = queuePageOffsets.get(department) ?? 0;
  const query = new URLSearchParams({ department, limit: "25", offset: String(offset) });
  const result = await api<QueuePage>(`/api/queue?${query}`);
  queuePageOffsets.set(department, result.offset);
  return result;
}

async function renderCommandCentre(): Promise<string> {
  const [data, facility] = await Promise.all([loadDashboard(), loadFacility()]);
  const overview = data.overview;
  const now = new Date();
  const timezone = facility.timezone || "Africa/Lusaka";
  const hour = Number(new Intl.DateTimeFormat("en-ZM", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = currentUser?.fullName.trim().split(/\s+/)[0] || "there";
  const facilityName = facility.name || currentUser?.facilityName || "your facility";
  const dateLabel = new Intl.DateTimeFormat("en-ZM", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(now);
  return `
    <section class="dashboard-hero"><div class="dashboard-hero-content"><div class="dashboard-hero-topline"><span class="dashboard-live-kicker"><i></i> LIVE CARE OVERVIEW</span><span class="dashboard-date"><span class="material-symbols-outlined" aria-hidden="true">calendar_today</span>${dateLabel}</span></div><h1>${greeting}, ${escapeHtml(firstName)}.</h1><p>Here’s the live picture of care across <strong>${escapeHtml(facilityName)}</strong>.</p><div class="dashboard-hero-bottom"><a class="button button-light" href="${screenHref("opd-reception-patient-check-in")}" data-screen="opd-reception-patient-check-in"><span class="material-symbols-outlined" aria-hidden="true">person_add</span> Register patient</a><span class="dashboard-privacy-note"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span> Private, real-time patient flow</span></div></div><div class="dashboard-hero-photo" aria-hidden="true"></div></section>
    <section class="metric-grid metric-grid-five">${metric("Arrivals today", numberValue(overview.checkedInToday), "person_check", "wine", "Registered today")}${metric("Waiting now", numberValue(overview.waiting), "hourglass_top", "amber", "Across all departments")}${metric("In care", numberValue(overview.inProgress), "health_and_safety", "teal", "Visits in progress")}${metric("Completed today", numberValue(overview.completedToday), "task_alt", "blue", "Visits completed")}${metric("Average waiting time", `${numberValue(overview.averageWaitMinutes)} min`, "schedule", "wine", "Across active visits")}</section>
    <div class="content-column"><section class="panel dashboard-department-panel"><div class="panel-heading"><div><h2>Department flow</h2><p>Current queue activity by service area.</p></div><a class="text-link" href="${screenHref("facility-operations-command-center")}" data-screen="facility-operations-command-center">View operations <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></div><div class="department-grid">${departmentOrder.map((department) => departmentCard(data.departments.find((row) => row.department === department), department)).join("")}</div></section></div>`;
}

async function renderOperations(screen: StitchScreen): Promise<string> {
  const [data, facility] = await Promise.all([loadDashboard(), loadFacility()]);
  const overview = data.overview;
  return `${pageHeading(screen)}<section class="facility-summary"><div><span class="page-kicker"><span></span> FACILITY</span><h2>${escapeHtml(facility.name)}</h2><p>Operational activity is calculated from registered patients and live queue events.</p></div><div class="summary-chip"><span class="material-symbols-outlined" aria-hidden="true">groups</span><strong>${numberValue(facility.staffCount)}</strong><small>active team members</small></div></section>
    <section class="metric-grid">${metric("Arrivals today", numberValue(overview.checkedInToday), "person_check", "wine", "Registered today")}${metric("Waiting", numberValue(overview.waiting), "hourglass_top", "amber", "Across departments")}${metric("Called", numberValue(overview.called), "record_voice_over", "blue", "Ready to be received")}${metric("In progress", numberValue(overview.inProgress), "health_and_safety", "teal", "Care currently underway")}</section>
    <section class="panel"><div class="panel-heading"><div><h2>Service areas</h2><p>Open a service area to view and manage its live queue.</p></div></div><div class="department-grid department-grid-large">${departmentOrder.map((department) => departmentCard(data.departments.find((row) => row.department === department), department)).join("")}</div></section>
    ${queuePanel("Active queue preview", data.queue, [], { showDepartment: true, actions: false, detail: "Top 8 visits, prioritized by urgency and arrival time. Open a service area to see and manage its complete queue." })}`;
}

type DisplayContentCategory = keyof PatientDisplayLibrary;

function defaultPatientDisplayLibrary(staff: StaffMember[]): PatientDisplayLibrary {
  const descriptions: Partial<Record<Department, string>> = {
    vitals: "Initial observations and clinical prioritisation",
    consultation: "Everyday outpatient care for adults and children",
    laboratory: "Blood tests and requested investigations",
    radiology: "Diagnostic imaging and ultrasound services",
    pharmacy: "Prescription filling and health advice",
  };
  const services = departmentOrder
    .filter((department) => department !== "reception")
    .map((department) => ({
      id: `service-${department}`,
      title: department === "consultation" ? "General OPD Consultation" : department === "laboratory" ? "Laboratory & Diagnostics" : department === "radiology" ? "Ultrasound & Radiology" : department === "pharmacy" ? "Pharmacy & Dispensary" : departmentLabels[department],
      description: descriptions[department] ?? "Care from the Mum’s Care team",
      icon: departmentIcons[department],
      enabled: true,
    }));
  const teamMembers: DisplayTeamMember[] = staff
    .filter((member) => member.accountRole !== "admin" && member.accountRole !== "pending_assignment")
    .map((member) => {
      const department = departmentForRole(member.accountRole);
      return {
        id: `staff-${member.id}`,
        name: member.fullName,
        role: member.jobTitle || ACCOUNT_ROLE_DEFINITIONS[member.accountRole].label,
        department: department ? departmentLabels[department] : "Care team",
        photoUrl: "",
        enabled: false,
      };
    });
  return { adverts: [], services, teamMembers, announcements: [] };
}

function readPatientDisplayLibrary(value: unknown, staff: StaffMember[]): PatientDisplayLibrary {
  const defaults = defaultPatientDisplayLibrary(staff);
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<PatientDisplayLibrary> : {};
  return {
    adverts: Array.isArray(stored.adverts) ? stored.adverts : defaults.adverts,
    services: Array.isArray(stored.services) ? stored.services : defaults.services,
    teamMembers: Array.isArray(stored.teamMembers) ? stored.teamMembers : defaults.teamMembers,
    announcements: Array.isArray(stored.announcements) ? stored.announcements : defaults.announcements,
  } as PatientDisplayLibrary;
}

function readPublicDisplayLibrary(value: unknown): PatientDisplayLibrary {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<PatientDisplayLibrary> : {};
  return {
    adverts: Array.isArray(stored.adverts) ? stored.adverts.filter((item) => item.enabled) : [],
    services: Array.isArray(stored.services) ? stored.services.filter((item) => item.enabled) : [],
    teamMembers: Array.isArray(stored.teamMembers) ? stored.teamMembers.filter((item) => item.enabled) : [],
    announcements: Array.isArray(stored.announcements) ? stored.announcements.filter((item) => item.enabled) : [],
  } as PatientDisplayLibrary;
}

function safeDisplayImageUrl(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "";
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

function displayItemControls(category: DisplayContentCategory, id: string, enabled: boolean, label: string): string {
  return `<div class="admin-content-actions"><button class="admin-content-icon-button" type="button" data-display-item-edit="${category}" data-entry-id="${escapeHtml(id)}" aria-label="Edit ${escapeHtml(label)}" title="Edit"><span class="material-symbols-outlined" aria-hidden="true">edit</span></button><button class="admin-content-icon-button is-danger" type="button" data-display-item-remove="${category}" data-entry-id="${escapeHtml(id)}" aria-label="Delete ${escapeHtml(label)}" title="Delete"><span class="material-symbols-outlined" aria-hidden="true">delete_outline</span></button><button class="admin-content-toggle" type="button" role="switch" data-display-item-toggle="${category}" data-entry-id="${escapeHtml(id)}" aria-checked="${enabled}" aria-label="${enabled ? "Hide" : "Show"} ${escapeHtml(label)} on patient displays"><span></span></button></div>`;
}

function renderDisplayLibraryGroup(category: DisplayContentCategory, title: string, description: string, icon: string, rows: string[], emptyMessage: string): string {
  const emptyIcon = category === "adverts" ? "add_photo_alternate" : category === "services" ? "medical_services" : category === "teamMembers" ? "person_add" : "campaign";
  return `<section class="admin-content-group"><header class="admin-content-group-header"><span class="admin-content-group-icon material-symbols-outlined" aria-hidden="true">${icon}</span><div><h3>${title}</h3><p>${description}</p></div><button class="button button-secondary admin-content-add" type="button" data-display-item-add="${category}"><span class="material-symbols-outlined" aria-hidden="true">add</span>Add</button></header><div class="admin-content-list" data-content-category="${category}">${rows.length ? rows.join("") : `<div class="admin-content-empty"><span class="material-symbols-outlined" aria-hidden="true">${emptyIcon}</span><span>${emptyMessage}</span></div>`}</div></section>`;
}

function renderPatientDisplayLibrary(library: PatientDisplayLibrary): string {
  const adverts = library.adverts.map((item) => {
    const imageUrl = safeDisplayImageUrl(item.imageUrl);
    const media = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy"/>`
      : `<span class="material-symbols-outlined" aria-hidden="true">image</span>`;
    return `<article class="admin-content-row"><span class="admin-content-thumb admin-advert-thumb">${media}</span><span class="admin-content-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span><span class="admin-content-tag">${escapeHtml(item.category || "Advert")}</span>${displayItemControls("adverts", item.id, item.enabled, item.title)}</article>`;
  });
  const services = library.services.map((item) => `<article class="admin-content-row admin-service-row"><span class="admin-content-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span><span class="admin-content-tag">${escapeHtml((item.icon || "Service").replaceAll("_", " "))}</span>${displayItemControls("services", item.id, item.enabled, item.title)}</article>`);
  const teamMembers = library.teamMembers.map((item) => {
    const imageUrl = safeDisplayImageUrl(item.photoUrl);
    const media = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy"/>`
      : `<span>${escapeHtml(initials(item.name))}</span>`;
    return `<article class="admin-content-row admin-team-row"><span class="admin-content-thumb admin-team-thumb">${media}</span><span class="admin-content-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.role)}${item.department ? ` · ${escapeHtml(item.department)}` : ""}</small></span>${displayItemControls("teamMembers", item.id, item.enabled, item.name)}</article>`;
  });
  const announcements = library.announcements.map((item) => `<article class="admin-content-row admin-announcement-row"><span class="material-symbols-outlined admin-announcement-icon" aria-hidden="true">campaign</span><span class="admin-content-copy"><strong>${escapeHtml(item.body)}</strong></span>${displayItemControls("announcements", item.id, item.enabled, item.body.slice(0, 80))}</article>`);
  return `<div class="admin-content-library">${renderDisplayLibraryGroup("adverts", "Waiting-area adverts", "Rotating promotions shown on the patient display screen.", "image", adverts, "No adverts yet. Add a promotion with a photo and display text.")}${renderDisplayLibraryGroup("services", "Services offered", "The hospital service catalogue on the display screen.", "stethoscope", services, "No services yet. Add the care services available at your facility.")}${renderDisplayLibraryGroup("teamMembers", "Meet the team", "Staff photos and roles shown in the waiting area.", "person", teamMembers, "No team profiles yet. Add staff members to introduce your care team.")}${renderDisplayLibraryGroup("announcements", "Patient announcements", "Enabled notices scroll continuously across the patient display footer.", "campaign", announcements, "No announcements yet. Add a notice for patients in the waiting area.")}</div>`;
}

function displayEntryField(label: string, name: string, value: string, options: { type?: string; placeholder?: string; maxLength?: number; required?: boolean } = {}): string {
  return `<label class="form-field display-content-field"><span>${label}</span><input class="text-input" name="${name}" type="${options.type ?? "text"}" value="${escapeHtml(value)}" placeholder="${escapeHtml(options.placeholder ?? "")}" ${options.maxLength ? `maxlength="${options.maxLength}"` : ""} ${options.required === false ? "" : "required"}/></label>`;
}

function displayEntryFieldsMarkup(category: DisplayContentCategory, entry?: PatientDisplayItem): string {
  const value = (key: string): string => entry && key in entry ? String((entry as unknown as Record<string, unknown>)[key] ?? "") : "";
  if (category === "adverts") {
    return `${displayEntryField("Promotion title", "title", value("title"), { maxLength: 100, placeholder: "e.g. Antenatal wellness classes" })}${displayEntryField("Short description", "description", value("description"), { maxLength: 240, placeholder: "A concise message for families in the waiting area" })}${displayEntryField("Category label", "category", value("category"), { maxLength: 60, placeholder: "e.g. Antenatal clinic" })}${displayEntryField("Image URL", "imageUrl", value("imageUrl"), { type: "text", required: false, maxLength: 2048, placeholder: "https://… or /media/photo.jpg" })}<div class="display-image-preview-wrap"><img id="display-entry-image-preview" alt="Promotion preview" ${safeDisplayImageUrl(value("imageUrl")) ? `src="${escapeHtml(safeDisplayImageUrl(value("imageUrl")))}"` : "hidden"}/><span id="display-entry-image-empty" ${safeDisplayImageUrl(value("imageUrl")) ? "hidden" : ""}>Add a secure image link to preview this promotion.</span></div>`;
  }
  if (category === "services") {
    const icons = ["stethoscope", "ecg_heart", "biotech", "radiology", "medication", "child_care", "favorite", "vaccines", "support_agent", "local_hospital", "schedule"];
    const selected = value("icon") || "stethoscope";
    return `${displayEntryField("Service name", "title", value("title"), { maxLength: 100, placeholder: "e.g. General OPD Consultation" })}${displayEntryField("Description", "description", value("description"), { maxLength: 240, placeholder: "What patients can expect from this service" })}<label class="form-field display-content-field"><span>Service icon</span><select class="text-input" name="icon" required>${icons.map((icon) => `<option value="${icon}" ${selected === icon ? "selected" : ""}>${escapeHtml(icon.replaceAll("_", " "))}</option>`).join("")}</select></label>`;
  }
  if (category === "teamMembers") {
    return `${displayEntryField("Team member name", "name", value("name"), { maxLength: 100, placeholder: "Full name" })}${displayEntryField("Role", "role", value("role"), { maxLength: 100, placeholder: "e.g. Registered midwife" })}${displayEntryField("Department", "department", value("department"), { maxLength: 80, placeholder: "e.g. Vitals & Triage" })}${displayEntryField("Photo URL", "photoUrl", value("photoUrl"), { type: "text", required: false, maxLength: 2048, placeholder: "https://… or /media/team-photo.jpg" })}<div class="display-image-preview-wrap"><img id="display-entry-image-preview" alt="Team profile preview" ${safeDisplayImageUrl(value("photoUrl")) ? `src="${escapeHtml(safeDisplayImageUrl(value("photoUrl")))}"` : "hidden"}/><span id="display-entry-image-empty" ${safeDisplayImageUrl(value("photoUrl")) ? "hidden" : ""}>Add a secure image link to preview this team profile.</span></div>`;
  }
  return `<label class="form-field display-content-field"><span>Announcement</span><textarea class="text-input" name="body" rows="4" minlength="2" maxlength="240" placeholder="Write a short notice for patients in the waiting area" required>${escapeHtml(value("body"))}</textarea></label><p class="display-announcement-guidance">Enabled announcements scroll in a continuous footer ticker. Keep notices general and do not include patient details.</p>`;
}

function updateDisplayLibraryCategory(library: PatientDisplayLibrary, category: DisplayContentCategory, entries: PatientDisplayItem[]): PatientDisplayLibrary {
  return { ...library, [category]: entries } as PatientDisplayLibrary;
}

async function renderAdminPanel(screen: StitchScreen): Promise<string> {
  const [facility, staff, invitations, dashboard] = await Promise.all([
    loadFacility(),
    loadStaff(),
    api<{ inviteCodes: FacilityInviteCode[] }>("/api/facility/invite-codes"),
    loadDashboard(),
  ]);
  const accountCounts = staff.reduce((counts, member) => {
    counts[member.accountRole] += 1;
    return counts;
  }, Object.fromEntries(ACCOUNT_ROLES.map((role) => [role, 0])) as Record<AccountRole, number>);
  const pendingCount = accountCounts.pending_assignment;
  const firstName = currentUser?.fullName.trim().split(/\s+/)[0] || "Administrator";
  const displaysEnabled = facility.settings.publicDisplayEnabled === true;
  currentPatientDisplayLibrary = readPatientDisplayLibrary(facility.settings.patientDisplayLibrary, staff);
  const adminActions: Array<{ slug: ScreenSlug; title: string; detail: string; icon: string; status: string }> = [
    { slug: "hospital-flow-settings", title: "Team and roles", detail: "Invite staff and assign station access.", icon: "manage_accounts", status: pendingCount ? `${pendingCount} pending` : `${staff.length} members` },
    { slug: "queue-configuration-studio", title: "Queue settings", detail: "Set service targets for each department.", icon: "tune", status: `${departmentOrder.length} stations` },
    { slug: "system-settings", title: "Patient displays", detail: "Manage connected monitors and display setup.", icon: "connected_tv", status: displaysEnabled ? "Enabled" : "Disabled" },
    { slug: "facility-operations-command-center", title: "Facility operations", detail: "Review live flow across the care stations.", icon: "monitoring", status: "Live overview" },
  ];
  const roleIcons: Record<AssignableRole, string> = {
    admin: "shield_person",
    receptionist: "how_to_reg",
    triage_nurse: "ecg_heart",
    clinician: "stethoscope",
    lab_technician: "biotech",
    radiology_technician: "radiology",
    pharmacist: "medication",
  };
  const teamRoles = ROLE_ASSIGNMENT_ROLES.map((role) => `<div class="admin-role-row"><span class="material-symbols-outlined" aria-hidden="true">${roleIcons[role]}</span><strong>${escapeHtml(ACCOUNT_ROLE_DEFINITIONS[role].label)}</strong><b>${accountCounts[role]}</b></div>`).join("");
  const departmentRows = departmentOrder.map((department) => {
    const stats = dashboard.departments.find((row) => row.department === department);
    return `<a class="admin-department-row" href="${screenHref(departmentScreenSlugs[department])}" data-screen="${departmentScreenSlugs[department]}"><span class="admin-department-icon material-symbols-outlined" aria-hidden="true">${departmentIcons[department]}</span><span class="admin-department-name"><strong>${escapeHtml(departmentLabels[department])}</strong><small>${numberValue(stats?.waiting)} waiting · ${numberValue(stats?.inProgress)} in service</small></span><span class="admin-department-active"><strong>${numberValue(stats?.active)}</strong><small>active</small></span><span class="material-symbols-outlined admin-department-arrow" aria-hidden="true">arrow_forward</span></a>`;
  }).join("");
  const tabs: Array<{ id: string; label: string; icon: string }> = [
    { id: "overview", label: "Overview", icon: "space_dashboard" },
    { id: "tickets", label: "Tickets", icon: "confirmation_number" },
    { id: "display-content", label: "Display Content", icon: "connected_tv" },
    { id: "service-points", label: "Service Points", icon: "medical_services" },
  ];
  const requestedTab = new URL(location.href).searchParams.get("adminTab");
  const selectedTab = tabs.find((tab) => tab.id === requestedTab)?.id ?? "overview";
  const tabControls = tabs.map((tab) => `<button class="admin-tab" id="admin-tab-${tab.id}" type="button" role="tab" aria-controls="admin-panel-${tab.id}" aria-selected="${selectedTab === tab.id}" tabindex="${selectedTab === tab.id ? "0" : "-1"}" data-admin-tab="${tab.id}"><span class="material-symbols-outlined" aria-hidden="true">${tab.icon}</span>${tab.label}</button>`).join("");
  const tabPanels = tabs.map((tab) => {
    let content = "";
    if (tab.id === "overview") {
      const performanceRows = departmentOrder.map((department) => {
        const stats = dashboard.departments.find((row) => row.department === department);
        const targetValues = facility.settings.departmentSlaMinutes as Partial<Record<Department, number>> | undefined;
        const target = targetValues?.[department];
        const averageWait = stats?.averageWaitMinutes;
        const health = !target ? "No target" : averageWait == null ? "Awaiting data" : averageWait > target ? "Above target" : "Within target";
        const healthTone = health === "Above target" ? "attention" : health === "Within target" ? "healthy" : "neutral";
        const waitLabel = averageWait == null ? "—" : `${numberValue(averageWait)} min`;
        const serviceLabel = stats?.averageServiceMinutes == null ? "—" : `${numberValue(stats.averageServiceMinutes)} min`;
        return `<a class="admin-performance-row" href="${screenHref(departmentScreenSlugs[department])}" data-screen="${departmentScreenSlugs[department]}"><span class="admin-performance-name"><span class="admin-department-icon material-symbols-outlined" aria-hidden="true">${departmentIcons[department]}</span><strong>${escapeHtml(departmentLabels[department])}</strong></span><span>${numberValue(stats?.servedToday)}</span><span>${waitLabel}</span><span>${serviceLabel}</span><span class="admin-health-cell"><span class="admin-health-chip admin-health-${healthTone}">${health}</span></span></a>`;
      }).join("");
      const toolCards = adminActions.map((action) => `<a class="admin-tool-card" href="${screenHref(action.slug)}" data-screen="${action.slug}"><span class="admin-tool-icon material-symbols-outlined" aria-hidden="true">${action.icon}</span><span class="admin-tool-copy"><strong>${escapeHtml(action.title)}</strong><small>${escapeHtml(action.detail)}</small><em>${escapeHtml(action.status)}</em></span><span class="material-symbols-outlined admin-tool-arrow" aria-hidden="true">arrow_forward</span></a>`).join("");
      content = `<section class="admin-hero"><div class="admin-hero-copy"><span class="admin-hero-eyebrow"><i></i> ADMINISTRATOR WORKSPACE</span><h2>Welcome, ${escapeHtml(firstName)}.</h2><p>Manage ${escapeHtml(facility.name)} and keep every care station running smoothly.</p><div class="admin-hero-actions"><a class="button button-light" href="${screenHref("hospital-flow-settings")}" data-screen="hospital-flow-settings"><span class="material-symbols-outlined" aria-hidden="true">manage_accounts</span> Manage team access</a><a class="admin-hero-link" href="${screenHref("facility-operations-command-center")}" data-screen="facility-operations-command-center">View live operations <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></div></div><div class="admin-hero-mark" aria-hidden="true"><span class="material-symbols-outlined">admin_panel_settings</span><i></i></div></section>
        <section class="metric-grid admin-metric-grid">${metric("Patient arrivals today", numberValue(dashboard.overview.checkedInToday), "person_check", "wine", "Registered at this facility")}${metric("Waiting now", numberValue(dashboard.overview.waiting), "hourglass_top", "amber", "Across all service points")}${metric("In service", numberValue(dashboard.overview.inProgress), "health_and_safety", "teal", "Care currently underway")}${metric("Average wait", `${numberValue(dashboard.overview.averageWaitMinutes)} min`, "schedule", "blue", `${numberValue(dashboard.overview.completedToday)} completed today`)}</section>
        <div class="admin-overview-grid"><section class="panel admin-performance-panel"><div class="panel-heading"><div><h2>Service point performance · today</h2><p>Completed stages, average wait and average service time.</p></div><span class="live-pill"><i></i> LIVE</span></div><div class="admin-performance-table"><div class="admin-performance-head"><span>Service point</span><span>Served</span><span>Avg wait</span><span>Avg service</span><span>Health</span></div>${performanceRows}</div></section><section class="panel admin-roles-panel"><div class="panel-heading"><div><h2>Team and access</h2><p>Role coverage for ${escapeHtml(facility.name)}.</p></div><span class="panel-count">${staff.length}</span></div><div class="admin-team-metrics"><div><strong>${staff.length}</strong><span>team members</span></div><div class="${pendingCount ? "is-attention" : ""}"><strong>${pendingCount}</strong><span>need role assignment</span></div><div><strong>${invitations.inviteCodes.length}</strong><span>active invitations</span></div></div><div class="admin-role-list">${teamRoles}</div><div class="admin-admin-actions">${toolCards}</div><a class="admin-panel-text-link" href="${screenHref("hospital-flow-settings")}" data-screen="hospital-flow-settings">Manage team access <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></section></div>`;
    } else if (tab.id === "tickets") {
      const totalActive = numberValue(dashboard.overview.waiting) + numberValue(dashboard.overview.called) + numberValue(dashboard.overview.inProgress);
      content = `<section class="metric-grid admin-metric-grid admin-ticket-metrics">${metric("Waiting", numberValue(dashboard.overview.waiting), "hourglass_top", "amber", "Ready for the next step")}${metric("Called", numberValue(dashboard.overview.called), "record_voice_over", "blue", "Awaiting the care team")}${metric("In service", numberValue(dashboard.overview.inProgress), "health_and_safety", "teal", "Being served now")}${metric("Completed today", numberValue(dashboard.overview.completedToday), "task_alt", "wine", "Visits completed")}</section><div class="admin-ticket-layout">${queuePanel("Active tickets", dashboard.queue, staff, { showDepartment: true, detail: "Update the latest active tickets or open a service point to manage its complete queue.", live: true, total: totalActive })}<section class="panel admin-ticket-stations"><div class="panel-heading"><div><h2>Queues by service point</h2><p>Open a queue to see every active ticket and manage the next step.</p></div></div><div class="admin-department-list">${departmentRows}</div></section></div>`;
    } else if (tab.id === "display-content") {
      const displayLibrary = currentPatientDisplayLibrary!;
      const displayEditors = publicDisplaySlugs.map((slug) => {
        const message = displayCopyFor(slug, facility.settings.publicDisplayContent);
        const target = displaysEnabled ? screenHref(slug) : screenHref("hospital-flow-settings");
        const action = displaysEnabled ? "Preview display" : "Enable displays";
        return `<article class="admin-display-card"><div class="admin-display-card-top"><span class="admin-display-icon material-symbols-outlined" aria-hidden="true">${sidebarIcons[slug]}</span><span class="admin-display-kind">PUBLIC MESSAGE</span></div><h3>${escapeHtml(sidebarLabels[slug])}</h3><label class="form-field admin-display-field"><span>Display label</span><input class="text-input" name="${slug}.eyebrow" value="${escapeHtml(message.eyebrow)}" maxlength="60" required/></label><label class="form-field admin-display-field"><span>Headline</span><input class="text-input" name="${slug}.headline" value="${escapeHtml(message.headline)}" maxlength="120" required/></label><label class="form-field admin-display-field"><span>Message</span><textarea class="text-input" name="${slug}.body" rows="3" maxlength="300" required>${escapeHtml(message.body)}</textarea></label><a class="admin-panel-text-link" href="${target}" data-screen="${displaysEnabled ? slug : "hospital-flow-settings"}">${action} <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></article>`;
      }).join("");
      content = `<section class="admin-display-status"><span class="admin-display-status-icon material-symbols-outlined" aria-hidden="true">${displaysEnabled ? "connected_tv" : "tv_off"}</span><div><span class="page-kicker"><span></span> PUBLIC DISPLAY CONTENT</span><h2>${displaysEnabled ? "Your waiting displays are live" : "Waiting displays are turned off"}</h2><p>${displaysEnabled ? "Manage the adverts, services, team profiles and notices your patients see." : "Prepare your display content now, then enable public displays in facility settings."}</p></div><a class="button button-secondary" href="${screenHref(displaysEnabled ? "system-settings" : "hospital-flow-settings")}" data-screen="${displaysEnabled ? "system-settings" : "hospital-flow-settings"}">${displaysEnabled ? "Manage displays" : "Open facility settings"}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></section>${renderPatientDisplayLibrary(displayLibrary)}<details class="admin-display-messages"><summary><span class="material-symbols-outlined" aria-hidden="true">edit_note</span><span><strong>Custom display messages</strong><small>Personalize the headline and welcome copy on each waiting display.</small></span><span class="material-symbols-outlined admin-display-expand" aria-hidden="true">expand_more</span></summary><form id="admin-display-content-form" class="admin-display-grid">${displayEditors}<footer class="admin-display-save"><p>Updates apply to this facility’s public displays.</p><button class="button button-primary" type="submit"><span class="material-symbols-outlined" aria-hidden="true">save</span> Save display messages</button></footer></form></details><dialog class="display-content-dialog" id="display-content-dialog" aria-labelledby="display-content-dialog-title"><form id="display-content-entry-form"><header class="display-content-dialog-header"><span class="admin-content-group-icon material-symbols-outlined" id="display-content-dialog-icon" aria-hidden="true">image</span><div><h2 id="display-content-dialog-title">Add display content</h2><p id="display-content-dialog-description">Update what patients see on the waiting display.</p></div><button class="admin-content-icon-button" type="button" data-display-dialog-close aria-label="Close"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></header><div id="display-content-dialog-fields" class="display-content-dialog-fields"></div><footer class="display-content-dialog-actions"><button class="button button-secondary" type="button" data-display-dialog-close>Cancel</button><button class="button button-primary" type="submit"><span class="material-symbols-outlined" aria-hidden="true">save</span> Save item</button></footer></form></dialog><p class="admin-privacy-note"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span> Public displays show ticket numbers and approved facility information. Patient names and clinical details stay private.</p>`;
    } else {
      content = `<section class="panel admin-departments-panel"><div class="panel-heading"><div><h2>Service points</h2><p>Review workload and open any station’s live queue.</p></div><span class="live-pill"><i></i> LIVE</span></div><div class="admin-department-list">${departmentRows}</div></section>${renderAdminServicePointSettings(facility)}`;
    }
    return `<section class="admin-tabpanel" id="admin-panel-${tab.id}" role="tabpanel" aria-labelledby="admin-tab-${tab.id}" tabindex="0"${selectedTab === tab.id ? "" : " hidden"}>${content}</section>`;
  }).join("");

  return `${pageHeading(screen, "FACILITY ADMINISTRATION")}<div class="admin-console"><div class="admin-tablist" role="tablist" aria-label="Administration workspace">${tabControls}</div>${tabPanels}</div>`;
}

function renderAdminServicePointSettings(facility: Facility): string {
  const targets = facility.settings.departmentSlaMinutes as Partial<Record<Department, number>> | undefined;
  return `<section class="panel admin-sla-panel"><div class="panel-heading"><div><h2>Service targets</h2><p>Set the expected wait time for each service point. Leave a value blank when no target is set.</p></div><span class="material-symbols-outlined panel-heading-icon" aria-hidden="true">tune</span></div><form id="sla-form" class="settings-form">${departmentOrder.map((department) => {
    const value = targets?.[department] ?? "";
    return `<div class="setting-row"><span><strong>${escapeHtml(departmentLabels[department])}</strong><small>Expected wait before the next service step.</small></span><span class="number-field"><span class="number-control"><button class="number-stepper" type="button" data-sla-step="-1" aria-label="Decrease ${escapeHtml(departmentLabels[department])} target by one minute" ${value === "" || value <= 1 ? "disabled" : ""}><span class="material-symbols-outlined" aria-hidden="true">remove</span></button><input name="${department}" type="number" min="1" max="240" step="1" value="${value}" placeholder="e.g. 30" aria-label="${escapeHtml(departmentLabels[department])} target in minutes"/><button class="number-stepper" type="button" data-sla-step="1" aria-label="Increase ${escapeHtml(departmentLabels[department])} target by one minute" ${value === 240 ? "disabled" : ""}><span class="material-symbols-outlined" aria-hidden="true">add</span></button></span><small>min</small></span></div>`;
  }).join("")}<div class="form-footer"><p>Changes apply to your facility only.</p><button class="button button-primary" type="submit">Save service targets</button></div></form></section>`;
}

function renderConfiguration(screen: StitchScreen, facility: Facility, isAdmin: boolean): string {
  const targets = facility.settings.departmentSlaMinutes as Partial<Record<Department, number>> | undefined;
  return `${pageHeading(screen)}<section class="panel panel-narrow"><div class="panel-heading"><div><h2>Department service targets</h2><p>Set the expected wait target used by your facility’s operations team. Blank values stay unconfigured.</p></div><span class="material-symbols-outlined panel-heading-icon" aria-hidden="true">tune</span></div>
    <form id="sla-form" class="settings-form">${departmentOrder.map((department) => {
      const value = targets?.[department] ?? "";
      return `<div class="setting-row"><span><strong>${escapeHtml(departmentLabels[department])}</strong><small>Expected wait before the next service step.</small></span><span class="number-field"><span class="number-control"><button class="number-stepper" type="button" data-sla-step="-1" aria-label="Decrease ${escapeHtml(departmentLabels[department])} target by one minute" ${!isAdmin || value === "" || value <= 1 ? "disabled" : ""}><span class="material-symbols-outlined" aria-hidden="true">remove</span></button><input name="${department}" type="number" min="1" max="240" step="1" value="${value}" placeholder="e.g. 30" aria-label="${escapeHtml(departmentLabels[department])} target in minutes" ${isAdmin ? "" : "disabled"}/><button class="number-stepper" type="button" data-sla-step="1" aria-label="Increase ${escapeHtml(departmentLabels[department])} target by one minute" ${!isAdmin || value === 240 ? "disabled" : ""}><span class="material-symbols-outlined" aria-hidden="true">add</span></button></span><small>min</small></span></div>`;
    }).join("")}
      ${isAdmin ? `<div class="form-footer"><p>Changes apply to your facility only.</p><button class="button button-primary" type="submit">Save service targets</button></div>` : `<p class="permission-note">A facility administrator can update service targets.</p>`}</form></section>`;
}

function renderRoleManagement(staff: StaffMember[], inviteCodes: FacilityInviteCode[], isAdmin: boolean): string {
  if (!isAdmin) return `<p class="permission-note">A facility administrator can manage team roles and invitations.</p>`;
  const invitationRows = inviteCodes.length
    ? inviteCodes.map((invite) => `<div class="role-invite-row"><span class="role-invite-mark material-symbols-outlined" aria-hidden="true">key</span><span class="role-invite-copy"><strong>${escapeHtml(ACCOUNT_ROLE_DEFINITIONS[invite.accountRole].label)}</strong><small>Created ${escapeHtml(formatDate(invite.createdAt))}${invite.createdByName ? ` by ${escapeHtml(invite.createdByName)}` : ""}</small></span><button class="button button-quiet role-revoke-button" type="button" data-revoke-invite="${escapeHtml(invite.id)}" aria-label="Revoke ${escapeHtml(ACCOUNT_ROLE_DEFINITIONS[invite.accountRole].label)} invite code">Revoke</button></div>`).join("")
    : `<div class="role-list-empty"><span class="material-symbols-outlined" aria-hidden="true">key_off</span><span>No active role invitations. Create one to invite a team member.</span></div>`;
  const staffRows = staff.map((member) => {
    const isSelf = member.id === currentUser?.id;
    const pendingOption = member.accountRole === "pending_assignment" ? `<option value="pending_assignment" selected>Role assignment needed</option>` : "";
    const options = `${pendingOption}${ROLE_ASSIGNMENT_ROLES.map((role) => `<option value="${role}" ${member.accountRole === role ? "selected" : ""}>${escapeHtml(ACCOUNT_ROLE_DEFINITIONS[role].label)}</option>`).join("")}`;
    return `<div class="team-role-row"><span class="team-role-avatar" aria-hidden="true">${escapeHtml(initials(member.fullName))}</span><span class="team-role-person"><strong>${escapeHtml(member.fullName)}${isSelf ? " · You" : ""}</strong><small>${escapeHtml(member.jobTitle)}</small></span><label class="team-role-select"><span class="sr-only">Role for ${escapeHtml(member.fullName)}</span><select class="text-input" data-member-role="${escapeHtml(member.id)}" data-original-role="${member.accountRole}" ${isSelf ? "disabled" : ""}>${options}</select></label>${isSelf ? `<span class="team-role-self">Current account</span>` : `<button class="button button-secondary team-role-save" type="button" data-save-member-role="${escapeHtml(member.id)}" aria-label="Save role for ${escapeHtml(member.fullName)}" disabled>Save role</button>`}</div>`;
  }).join("");
  return `<section class="role-management-panel"><div class="role-management-heading"><div><span class="role-access-eyebrow">TEAM ADMINISTRATION</span><h3>Team roles and invitations</h3><p>Assign each team member to the care station they work in.</p></div><span class="material-symbols-outlined" aria-hidden="true">manage_accounts</span></div><form id="invite-code-form" class="role-invite-form"><label><span>Invite role</span><select class="text-input" name="accountRole" required>${INVITABLE_ROLES.map((role) => `<option value="${role}">${escapeHtml(ACCOUNT_ROLE_DEFINITIONS[role].label)}</option>`).join("")}</select></label><button class="button button-primary" type="submit"><span class="material-symbols-outlined" aria-hidden="true">add_link</span>Create role invite</button></form><div class="role-invite-list"><div class="role-list-heading"><strong>Active invitations</strong><small>Codes are shown once and can be revoked here.</small></div>${invitationRows}</div><div class="team-role-list"><div class="role-list-heading"><strong>Facility team</strong><small>Changing a role signs that member out so the new access takes effect on their next sign-in.</small></div>${staffRows}</div></section>`;
}

function renderSettings(screen: StitchScreen, facility: Facility, isAdmin: boolean, staff: StaffMember[], inviteCodes: FacilityInviteCode[]): string {
  const enabled = facility.settings.publicDisplayEnabled === true;
  return `${pageHeading(screen)}<section class="settings-layout"><div class="panel"><div class="panel-heading"><div><h2>Facility preferences</h2><p>Control the shared settings used by your workspace.</p></div><span class="material-symbols-outlined panel-heading-icon" aria-hidden="true">tune</span></div><form id="facility-settings-form" class="settings-form">
      <div class="setting-row"><span><strong>Facility name</strong><small>Used in the workspace identity.</small></span><span class="setting-value">${escapeHtml(facility.name)}</span></div>
      <label class="setting-row"><span><strong>Timezone</strong><small>Used to group daily operations.</small></span><select class="text-input setting-text" name="timezone" ${isAdmin ? "" : "disabled"}>${["Africa/Lusaka", "Africa/Johannesburg", "UTC"].map((zone) => `<option value="${zone}" ${facility.timezone === zone ? "selected" : ""}>${zone}</option>`).join("")}</select></label>
      <label class="setting-row"><span><strong>Public waiting displays</strong><small>Only anonymized ticket numbers are shown.</small></span><span class="switch-wrap"><input name="publicDisplayEnabled" type="checkbox" ${enabled ? "checked" : ""} ${isAdmin ? "" : "disabled"}/><span>${enabled ? "Enabled" : "Disabled"}</span></span></label>
      ${isAdmin ? `<div class="form-footer"><span></span><button class="button button-primary" type="submit">Save preferences</button></div>` : `<p class="permission-note">A facility administrator can update preferences.</p>`}</form></div>
      <div class="panel invite-panel"><div class="panel-heading"><div><h2>Team access</h2><p>Create role-specific invitations and set each team member’s station access.</p></div><span class="material-symbols-outlined panel-heading-icon" aria-hidden="true">key</span></div><div class="invite-explainer"><span class="material-symbols-outlined" aria-hidden="true">shield_lock</span><p>Each invitation grants access to one care role. You can revoke active codes and update existing team roles at any time.</p></div>${renderRoleManagement(staff, inviteCodes, isAdmin)}</div></section>`;
}

function renderRoleAccessPanel(staff: StaffMember[]): string {
  const countLabel = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;
  const activeRole = currentUser?.accountRole ?? "pending_assignment";
  const accountCounts = staff.reduce((counts, member) => {
    counts[member.accountRole] += 1;
    return counts;
  }, Object.fromEntries(ACCOUNT_ROLES.map((role) => [role, 0])) as Record<AccountRole, number>);
  const roleIcons: Record<AssignableRole, string> = {
    admin: "shield_person",
    receptionist: "how_to_reg",
    triage_nurse: "ecg_heart",
    clinician: "stethoscope",
    lab_technician: "biotech",
    radiology_technician: "radiology",
    pharmacist: "medication",
  };
  const currentRole = ACCOUNT_ROLE_DEFINITIONS[activeRole];
  const roleCards = ROLE_ASSIGNMENT_ROLES.map((role) => {
    const definition = ACCOUNT_ROLE_DEFINITIONS[role];
    const current = activeRole === role;
    const homeScreen = ROLE_HOME_SCREENS[role] as ScreenSlug;
    const workspaceView = role === "admin" ? "All facility workspaces" : sidebarLabels[homeScreen];
    return `<article class="role-access-option${current ? " is-current-role" : ""}"><div class="role-option-heading"><span class="role-option-icon${role === "admin" ? "" : " role-option-icon-team"} material-symbols-outlined" aria-hidden="true">${roleIcons[role]}</span><span class="role-option-copy"><h3>${escapeHtml(definition.label)}</h3><small>${countLabel(accountCounts[role], "account", "accounts")}</small></span>${current ? `<span class="role-current-badge">Your role</span>` : ""}</div><p class="role-option-description">${escapeHtml(definition.description)}</p><ul aria-label="Workspace view available to ${escapeHtml(definition.label)}"><li><span class="material-symbols-outlined" aria-hidden="true">visibility</span><span>Workspace view: <strong>${escapeHtml(workspaceView)}</strong></span></li></ul></article>`;
  }).join("");
  const pendingLabel = accountCounts.pending_assignment
    ? `${countLabel(accountCounts.pending_assignment, "account needs", "accounts need")} role assignment before patient data is available.`
    : "New team invitations are assigned to a specific care station.";
  return `<section class="role-access-card"><header class="role-access-heading"><span class="role-access-heading-icon material-symbols-outlined" aria-hidden="true">admin_panel_settings</span><div><span class="role-access-eyebrow">ACCESS CONTROL</span><h2>Role Based Access</h2><p>Each account sees the workspace screens needed for its responsibilities.</p></div><span class="role-access-enforced"><i></i> Server enforced</span></header><div class="role-current-user"><span class="role-current-avatar material-symbols-outlined" aria-hidden="true">account_circle</span><span class="role-current-copy"><small>YOUR CURRENT ACCESS</small><strong>${escapeHtml(currentUser?.fullName ?? "Current user")}</strong></span><span class="role-current-value"><strong>${escapeHtml(currentRole.label)}</strong><small>${activeRole === "admin" ? "All facility workspaces" : activeRole === "pending_assignment" ? "No facility data" : "One assigned care station"}</small></span></div><div class="role-access-grid">${roleCards}</div><footer class="role-access-footer"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span><p>Administrators can see all workspaces. Each care role is limited to its matching station. ${pendingLabel} Station queues and admin-only settings are also checked by the server.</p><a class="text-link" href="${screenHref("hospital-flow-settings")}" data-screen="hospital-flow-settings">Manage team roles <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></footer></section>`;
}

function renderSystemSettings(screen: StitchScreen, facility: Facility, staff: StaffMember[]): string {
  const displaysEnabled = facility.settings.publicDisplayEnabled === true;
  const currentWidth = Math.round(window.screen.availWidth || window.innerWidth);
  const currentHeight = Math.round(window.screen.availHeight || window.innerHeight);
  const displayOptions: Array<[PublicDisplaySlug, string]> = [
    ["main-waiting-area-tv-display", "Main waiting area"],
    ["vitals-waiting-area-tv-display", "Vitals waiting area"],
    ["audio-announcement-broadcast-tv-display", "Ward announcements"],
  ];
  let monitorResult = `<div class="monitor-empty-state"><span class="monitor-empty-icon material-symbols-outlined" aria-hidden="true">screen_search_desktop</span><div><strong>Ready to find your displays</strong><p>Scan for connected monitors. Your browser will ask for permission to identify screens and place display windows.</p></div></div>`;
  if (monitorDetection.kind === "detected") {
    const monitors = monitorDetection.details.screens;
    monitorResult = monitors.length
      ? `<div class="monitor-card-grid">${monitors.map((monitor, index) => {
        const label = monitor.label?.trim() || (monitor.isPrimary ? "Primary monitor" : `Monitor ${index + 1}`);
        const left = monitor.availLeft ?? monitor.left ?? 0;
        const top = monitor.availTop ?? monitor.top ?? 0;
        return `<article class="monitor-card${monitor.isPrimary ? " monitor-card-primary" : ""}"><div class="monitor-card-top"><span class="monitor-card-icon material-symbols-outlined" aria-hidden="true">${monitor.isPrimary ? "desktop_windows" : "tv"}</span><span class="monitor-badge${monitor.isPrimary ? " monitor-badge-primary" : ""}">${monitor.isPrimary ? "Primary display" : "Extended display"}</span></div><h3>${escapeHtml(label)}</h3><p class="monitor-resolution">${Math.round(monitor.availWidth)} × ${Math.round(monitor.availHeight)} <span>available pixels</span></p><div class="monitor-card-meta"><span><i></i>${monitor.isInternal === true ? "Built-in screen" : monitor.isInternal === false ? "Connected monitor" : "Detected screen"}</span><span>Position ${Math.round(left)}, ${Math.round(top)}</span></div><button type="button" class="button ${monitor.isPrimary ? "button-secondary" : "button-primary"} monitor-launch-button" data-open-monitor="${index}"><span class="material-symbols-outlined" aria-hidden="true">open_in_new</span> Open patient display here</button></article>`;
      }).join("")}</div>${monitors.length > 1 ? `<p class="monitor-detection-footnote"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span> ${monitors.length} monitors detected. Displays update automatically when a monitor is connected or removed.</p>` : `<p class="monitor-detection-footnote"><span class="material-symbols-outlined" aria-hidden="true">info</span> One display is available. To use a second screen, set your computer to Extend mode and scan again.</p>`}`
      : `<div class="monitor-empty-state"><span class="monitor-empty-icon material-symbols-outlined" aria-hidden="true">monitor</span><div><strong>No screens were returned</strong><p>Connect a monitor, choose Extend in your computer’s display settings, then scan again.</p></div></div>`;
  } else if (monitorDetection.kind === "unsupported") {
    const fallback = monitorDetection.extended === false
      ? "Your browser reports one available display. Connect another monitor and choose Extend in your computer’s display settings, then try again in a supported browser."
      : monitorDetection.extended === true
        ? "Your browser can see an extended desktop, but it does not provide screen placement details. Use a browser that supports detailed display access to place patient screens precisely."
        : "This browser does not provide detailed monitor access. Connect and extend your displays in your computer’s display settings, then use a browser that supports display detection for precise placement.";
    monitorResult = `<div class="monitor-empty-state monitor-guidance-state"><span class="monitor-empty-icon material-symbols-outlined" aria-hidden="true">info</span><div><strong>Detailed monitor detection is not available here</strong><p>${fallback}</p></div></div>`;
  } else if (monitorDetection.kind === "denied") {
    monitorResult = `<div class="monitor-empty-state monitor-guidance-state"><span class="monitor-empty-icon material-symbols-outlined" aria-hidden="true">admin_panel_settings</span><div><strong>Monitor access needs permission</strong><p>${escapeHtml(monitorDetection.message)} You can update this site’s permission in your browser settings and scan again.</p></div></div>`;
  }
  const scanLabel = monitorDetection.kind === "detected" ? "Scan again" : "Detect displays";
  return `${pageHeading(screen, "SYSTEM & DISPLAYS")}<section class="system-overview-card"><div class="system-overview-header"><span class="system-overview-mark material-symbols-outlined" aria-hidden="true">settings_suggest</span><div><span class="system-overview-eyebrow">WORKSPACE PROFILE</span><h2>System overview</h2><p>Your facility’s core settings and display status.</p></div><span class="system-status-pill"><i></i> Workspace active</span></div><div class="system-overview-list"><div class="system-overview-row"><span class="material-symbols-outlined" aria-hidden="true">local_hospital</span><span><strong>Facility</strong><small>Workspace identity</small></span><b>${escapeHtml(facility.name)}</b></div><div class="system-overview-row"><span class="material-symbols-outlined" aria-hidden="true">schedule</span><span><strong>System timezone</strong><small>Used for local dates and daily operations</small></span><b>${escapeHtml(facility.timezone)}</b></div><div class="system-overview-row"><span class="material-symbols-outlined" aria-hidden="true">tv</span><span><strong>Patient displays</strong><small>Public screens show anonymized ticket numbers</small></span><b class="${displaysEnabled ? "system-value-positive" : ""}">${displaysEnabled ? "Enabled" : "Disabled"}</b></div><div class="system-overview-row"><span class="material-symbols-outlined" aria-hidden="true">groups</span><span><strong>Active team members</strong><small>People with access to this facility</small></span><b>${numberValue(facility.staffCount)}</b></div></div><div class="system-overview-footer"><p>Manage facility preferences and team access.</p><a class="button button-secondary" href="${screenHref("hospital-flow-settings")}" data-screen="hospital-flow-settings">Open facility settings <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></div></section>
    ${renderRoleAccessPanel(staff)}
    <section class="monitor-setup-card"><div class="monitor-setup-heading"><div class="monitor-heading-icon material-symbols-outlined" aria-hidden="true">connected_tv</div><div class="monitor-heading-copy"><span class="monitor-section-eyebrow">PATIENT DISPLAY SETUP</span><h2>Connected monitors</h2><p>Extend your patient displays onto the screens connected to this computer.</p></div><button class="button button-primary monitor-detect-button" id="detect-monitors" type="button"><span class="material-symbols-outlined" aria-hidden="true">${monitorDetection.kind === "detected" ? "refresh" : "screen_search_desktop"}</span>${scanLabel}</button></div><div class="monitor-current-screen"><span class="monitor-current-icon material-symbols-outlined" aria-hidden="true">laptop_mac</span><span><strong>This screen</strong><small>Current browser window · ${currentWidth} × ${currentHeight}</small></span><span class="monitor-current-live"><i></i> In use</span></div><div class="monitor-results" aria-live="polite">${monitorResult}</div><div class="monitor-launch-settings"><div><span class="material-symbols-outlined" aria-hidden="true">cast</span><span><strong>Choose a patient display</strong><small>Open a live, privacy-safe screen on any detected monitor.</small></span></div><label class="monitor-display-picker"><span class="sr-only">Patient display to open</span><select id="monitor-display-choice" class="text-input">${displayOptions.map(([slug, label]) => `<option value="${slug}">${label}</option>`).join("")}</select></label></div><div class="monitor-permission-note"><span class="material-symbols-outlined" aria-hidden="true">lock</span><p>Monitor access is requested only when you choose Detect displays. Your browser may require this page to be served over HTTPS or localhost. The computer’s display mode is controlled in its system settings.</p></div></section>`;
}

function careFlowStage(department: Department, title: string, detail: string, icon: string, activeDepartment: Department): string {
  const active = department === activeDepartment;
  return `<div class="care-flow-stage${active ? " is-current-step" : ""}"${active ? ' aria-current="step"' : ""}><span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${detail}</small></span></div>`;
}

function renderCareFlow(activeDepartment: Department): string {
  return `<section class="care-flow-card" aria-label="Standard patient care pathway"><div class="care-flow-heading"><div><span class="page-kicker"><span></span> STANDARD VISIT FLOW</span><h2>One ticket. A clear next step.</h2></div><span class="care-flow-privacy"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span> One continuous visit</span></div><div class="care-flow-linear">${careFlowStage("reception", "Reception & registration", "Check-in and ticket", "assignment", activeDepartment)}<span class="care-flow-arrow material-symbols-outlined" aria-hidden="true">arrow_forward</span>${careFlowStage("vitals", "Nurses’ vitals", "Initial observations", "ecg_heart", activeDepartment)}<span class="care-flow-arrow material-symbols-outlined" aria-hidden="true">arrow_forward</span>${careFlowStage("consultation", "Doctor’s screening room", "Clinical review and referral", "stethoscope", activeDepartment)}</div><div class="care-flow-branch-heading"><span>FROM CONSULTATION, WHEN NEEDED</span><span class="care-flow-branch-line"></span></div><div class="care-flow-branches">${careFlowStage("laboratory", "Laboratory", "Results return to doctor", "biotech", activeDepartment)}${careFlowStage("radiology", "Radiology", "Results return to doctor", "radiology", activeDepartment)}${careFlowStage("pharmacy", "Pharmacy", "If prescribed · then complete", "medication", activeDepartment)}</div><p class="care-flow-note">Laboratory and Radiology return to Consultation for results review when needed. Without investigations, the doctor can send the patient directly to Pharmacy. Complete the visit after Consultation when no further care is needed, or after Pharmacy.</p></section>`;
}

function renderCheckIn(screen: StitchScreen, page: QueuePage): string {
  const { queue: entries } = page;
  const receptionQueuePanel = queuePanel("Reception queue", entries, [], { detail: "Call each registered patient, begin service, then move the ticket to Vitals.", live: true, total: page.total });
  const checkInDialog = `<dialog class="checkin-dialog" id="checkin-dialog" aria-labelledby="checkin-dialog-title" aria-describedby="checkin-dialog-description"><div class="checkin-dialog-header"><div><span class="page-kicker"><span></span> NEW PATIENT</span><h2 id="checkin-dialog-title">New patient check-in</h2><p id="checkin-dialog-description">Enter the patient details required to create their queue record.</p></div><button class="checkin-dialog-close" id="close-checkin-dialog" type="button" aria-label="Close check-in form"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></div><div class="checkin-dialog-body"><form id="checkin-form" class="form-grid">
      <label class="form-field"><span>First name <b>*</b></span><input class="text-input" name="firstName" required maxlength="80" autocomplete="given-name" placeholder="First name"/></label>
      <label class="form-field"><span>Last name <b>*</b></span><input class="text-input" name="lastName" required maxlength="80" autocomplete="family-name" placeholder="Last name"/></label>
      <label class="form-field"><span>National ID or facility identifier</span><input class="text-input" name="identifier" maxlength="80" placeholder="Optional identifier"/></label>
      <label class="form-field"><span>Phone number</span><input class="text-input" name="phone" type="tel" maxlength="40" autocomplete="tel" placeholder="Optional contact number"/></label>
      <label class="form-field"><span>Date of birth</span><input class="text-input" name="dateOfBirth" type="date"/></label>
      <label class="form-field"><span>Priority</span><select class="text-input" name="priority"><option value="standard">Standard</option><option value="priority">Priority</option><option value="urgent">Urgent — clinician review</option></select></label>
      <label class="form-field form-field-wide"><span>Reason for visit <b>*</b></span><textarea class="text-input" name="reason" required minlength="2" maxlength="240" rows="3" placeholder="Brief reason for today’s visit"></textarea></label>
      <div class="form-field-wide form-footer"><p>Only enter information required for registration.</p><button class="button button-primary" type="submit"><span class="material-symbols-outlined" aria-hidden="true">confirmation_number</span> Check in patient</button></div>
      <div class="form-field-wide" id="checkin-result" aria-live="polite"></div>
    </form><aside class="checkin-note"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span><h3>Care starts with a clear handoff.</h3><p>A queue ticket is created and saved for your facility as soon as check-in is complete.</p></aside></div></dialog>`;
  return `${pageHeading(screen, "PATIENT REGISTRATION")}${renderCareFlow("reception")}<section class="panel reception-checkin-launch"><div><span class="page-kicker"><span></span> RECEPTION DESK</span><h2>Register a patient</h2><p>Start a new visit and add the patient to the live facility queue.</p></div><button class="button button-primary" id="open-checkin-dialog" type="button"><span class="material-symbols-outlined" aria-hidden="true">person_add</span> New patient check-in</button></section>${receptionQueuePanel}${queuePager(page, "reception")}${checkInDialog}`;
}

function renderClinicalQueue(screen: StitchScreen, department: Department, page: QueuePage, staff: StaffMember[]): string {
  const { queue: entries } = page;
  const { waiting, inProgress, called } = page;
  const workflowInstructions: Record<Department, string> = {
    reception: "Call each registered patient, begin service, then move the ticket to Vitals.",
    vitals: "Complete the initial observations, then send the patient to Consultation.",
    consultation: "Refer to Laboratory or Radiology when tests are needed, or send directly to Pharmacy when prescribed. Complete the visit here if no further care is needed.",
    laboratory: "Complete the requested investigation, then return the patient to Consultation for results review.",
    radiology: "Complete the requested scan, then return the patient to Consultation for results review.",
    pharmacy: "Dispense the prescribed medication, then complete the visit.",
  };
  const workflowStrip = currentUser?.accountRole === "admin"
    ? `<nav class="workflow-strip" aria-label="Department workstations">${departmentOrder.map((item) => `<a class="${item === department ? "workflow-current" : ""}" href="${screenHref(departmentScreenSlugs[item])}" data-screen="${departmentScreenSlugs[item]}" ${item === department ? 'aria-current="page"' : ""}>${escapeHtml(departmentLabels[item])}</a>`).join("")}</nav>`
    : "";
  return `${pageHeading(screen, `${departmentLabels[department].toLocaleUpperCase("en")} WORKSTATION`)}<section class="metric-grid metric-grid-compact">${metric("Waiting", waiting, "hourglass_top", "amber", "Ready for the next step")}${metric("Called", called, "record_voice_over", "blue", "Awaiting staff")}${metric("In progress", inProgress, "health_and_safety", "teal", "Currently being served")}</section>
    ${renderCareFlow(department)}${workflowStrip}
    ${queuePanel(`${departmentLabels[department]} queue`, entries, staff, { detail: workflowInstructions[department], total: page.total, workstation: true })}${queuePager(page, department)}`;
}

function renderVitalsWorkstation(page: QueuePage): string {
  const currentEntry = page.queue.find((entry) => entry.status === "in_progress")
    ?? page.queue.find((entry) => entry.status === "called");
  const queueEntries = page.queue.filter((entry) => entry.id !== currentEntry?.id);
  const staffName = currentUser?.fullName ?? "Vitals team member";
  const jobTitle = currentUser?.jobTitle.trim() || "Triage nurse";
  const deskName = "Vitals and Triage";
  let waitingIndex = 0;
  const queueRows = queueEntries.map((entry) => {
    const isWaiting = entry.status === "waiting";
    const isCalled = entry.status === "called";
    const isNext = isWaiting && waitingIndex++ === 0;
    const action = isWaiting
      ? `<button class="vitals-call-button" type="button" data-queue-action="call" data-entry-id="${escapeHtml(entry.id)}" aria-label="Call ticket ${escapeHtml(entry.ticketNumber)}"><span class="material-symbols-outlined" aria-hidden="true">call</span>Call</button>`
      : isCalled
        ? `<button class="vitals-call-button vitals-start-button" type="button" data-queue-action="start" data-entry-id="${escapeHtml(entry.id)}" aria-label="Start vitals for ticket ${escapeHtml(entry.ticketNumber)}"><span class="material-symbols-outlined" aria-hidden="true">health_and_safety</span>Start</button>`
        : `<span class="vitals-row-status is-progress">In service</span>`;
    return `<article class="vitals-queue-row${isNext ? " is-next" : ""}" role="listitem" data-status="${entry.status}" data-priority="${entry.priority}">
    <strong class="vitals-ticket-number">${escapeHtml(entry.ticketNumber)}</strong>
    <div class="vitals-patient-copy"><strong>${escapeHtml(entry.firstName)} ${escapeHtml(entry.lastName)}</strong><span class="vitals-visit-reason" title="${escapeHtml(entry.reason)}">${escapeHtml(entry.reason)}</span>${isCalled ? `<span class="vitals-row-status is-called">Called · ready to start</span>` : ""}</div>
    <span class="vitals-wait-badge"><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${numberValue(entry.waitMinutes)}m</span>
    ${action}
  </article>`;
  }).join("");
  const activeContent = currentEntry
    ? `<div class="vitals-current-content"><div class="vitals-current-kicker"><span>${currentEntry.status === "called" ? "READY TO BEGIN" : "NOW SERVING"}</span>${currentEntry.status === "called" ? `<span class="vitals-current-status is-called">Called</span>` : `<span class="vitals-current-status is-progress">In progress</span>`}</div><strong class="vitals-current-ticket">${escapeHtml(currentEntry.ticketNumber)}</strong><h3>${escapeHtml(currentEntry.firstName)} ${escapeHtml(currentEntry.lastName)}</h3><p>${escapeHtml(currentEntry.reason)}</p><div class="vitals-current-meta"><span><span class="material-symbols-outlined" aria-hidden="true">schedule</span>At this station ${numberValue(currentEntry.waitMinutes)} min</span>${currentEntry.assignedUserName ? `<span><span class="material-symbols-outlined" aria-hidden="true">person</span>${escapeHtml(currentEntry.assignedUserName)}</span>` : ""}</div>${currentEntry.status === "called"
      ? `<button class="vitals-service-action" type="button" data-queue-action="start" data-entry-id="${escapeHtml(currentEntry.id)}"><span class="material-symbols-outlined" aria-hidden="true">health_and_safety</span>Start vitals</button>`
      : `<button class="vitals-service-action" type="button" data-queue-action="advance" data-entry-id="${escapeHtml(currentEntry.id)}" data-next-department="consultation"><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>Send to Consultation</button>`}</div>`
    : `<div class="vitals-current-empty"><span class="vitals-current-empty-icon material-symbols-outlined" aria-hidden="true">call</span><h2>No patient in service</h2><p>Call the next ticket from the queue on the left to begin.</p></div>`;

  return `<section class="vitals-workstation" aria-label="Vitals and Triage workstation">
    <header class="vitals-workstation-header">
      <div class="vitals-workstation-brand"><span class="vitals-brand-mark material-symbols-outlined" aria-hidden="true">ecg_heart</span><span class="vitals-brand-name">Mum’s Care <strong>Hospital</strong></span><span class="vitals-department-pill"><i></i>Vitals</span></div>
      <div class="vitals-staff-summary"><span><strong>${escapeHtml(staffName)}</strong><small>${escapeHtml(jobTitle)}</small></span><span class="vitals-live-pill"><i></i>Live</span></div>
    </header>
    <div class="vitals-workstation-grid">
      <section class="vitals-queue-card" aria-labelledby="vitals-queue-title">
        <header class="vitals-queue-heading"><div><h1 id="vitals-queue-title">Queue · Vitals</h1><p role="status" aria-live="polite">${page.waiting} waiting${page.waiting ? ` · longest ${numberValue(page.longestWaitMinutes)} min` : ""}${page.called ? ` · ${page.called} called` : ""}</p></div><span class="vitals-queue-total">${page.waiting}</span></header>
        <div class="vitals-queue-list"${queueEntries.length ? ' role="list"' : ""}>${queueEntries.length ? queueRows : `<div class="vitals-queue-empty"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span><strong>No one waiting</strong><p>New patients will appear here when they are ready for vitals.</p></div>`}</div>
        ${page.total > page.limit ? queuePager(page, "vitals") : ""}
      </section>
      <aside class="vitals-service-column"><section class="vitals-current-card" aria-label="Current patient in service">${activeContent}</section><section class="vitals-desk-card"><span class="vitals-desk-icon material-symbols-outlined" aria-hidden="true">medical_services</span><span><small>WORKING AT</small><strong>${escapeHtml(deskName)}</strong></span><span class="vitals-desk-live"><i></i>Queue updates live</span></section></aside>
    </div>
  </section>`;
}

function renderOperationsScreens(screen: StitchScreen, displayEnabled: boolean, counts: PublicDepartmentCount[]): string {
  const liveCalls = counts.reduce((sum, row) => sum + numberValue(row.called) + numberValue(row.inProgress), 0);
  return `${pageHeading(screen, "DISPLAY OPERATIONS")}<section class="display-control-card"><div class="display-control-mark"><span class="material-symbols-outlined" aria-hidden="true">connected_tv</span></div><div class="display-control-copy"><span class="page-kicker"><span></span> FACILITY DISPLAY STATUS</span><h2>${displayEnabled ? "Patient displays are enabled" : "Patient displays are currently disabled"}</h2><p>${displayEnabled ? "Only ticket numbers and service status are available to public-facing views." : "Enable public waiting displays in Flow Settings to make live call information available."}</p></div><a class="button button-secondary" href="${screenHref("hospital-flow-settings")}" data-screen="hospital-flow-settings">Open settings <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></section>
    <section class="metric-grid metric-grid-compact">${metric("Live calls", liveCalls, "record_voice_over", "wine", "Tickets called or in service")}${metric("Public displays", displayEnabled ? "Enabled" : "Disabled", "tv", "blue", "Facility display preference")}${metric("Privacy guard", "On", "shield_lock", "teal", "Patient names are never shown")}</section>
    <section class="panel"><div class="panel-heading"><div><h2>Display access</h2><p>Use a screen below for an authenticated workstation display. Public access is available only while the facility setting is enabled.</p></div></div><div class="department-grid">${[
      ["audio-announcement-broadcast-tv-display", "Ward Announcements"],
      ["vitals-waiting-area-tv-display", "Antenatal Triage"],
      ["main-waiting-area-tv-display", "Main Waiting Area"],
    ].map(([slug, label]) => `<a class="department-card" href="${screenHref(slug as ScreenSlug)}" data-screen="${slug}"><span class="department-icon material-symbols-outlined" aria-hidden="true">tv</span><span class="department-card-copy"><strong>${escapeHtml(label)}</strong><small>Privacy-safe live ticket display</small></span><span class="material-symbols-outlined department-arrow" aria-hidden="true">arrow_outward</span></a>`).join("")}</div></section>`;
}

function renderPatientDisplayDirectory(screen: StitchScreen): string {
  const directoryCategories: StitchScreen["category"][] = ["Patient-Facing Displays", "Clinical Workstations"];
  const options = directoryCategories.flatMap((category) =>
    screens.filter((entry) => entry.category === category && entry.slug !== "patient-display"),
  );
  return `${pageHeading(screen)}<section class="panel display-directory-panel"><div class="panel-heading"><div><h2>Patient display options</h2><p>Choose a patient display or care team workstation to open its live screen or controls.</p></div><span class="material-symbols-outlined panel-heading-icon" aria-hidden="true">connected_tv</span></div><div class="display-directory-list">${options.map((option) => `<a class="display-directory-link" href="${screenHref(option.slug)}" data-screen="${option.slug}"><span class="department-icon material-symbols-outlined" aria-hidden="true">${sidebarIcons[option.slug]}</span><span class="display-directory-copy"><strong>${escapeHtml(sidebarLabels[option.slug])}</strong><small>${escapeHtml(option.description)}</small></span><span class="material-symbols-outlined display-directory-arrow" aria-hidden="true">arrow_forward</span></a>`).join("")}</div></section>`;
}

const publicDisplayMessages: Record<PublicDisplaySlug, { eyebrow: string; headline: string; body: string }> = {
  "audio-announcement-broadcast-tv-display": {
    eyebrow: "CARE TEAM UPDATES",
    headline: "Your care team is ready to guide you.",
    body: "Watch for your ticket number and follow the named service area. If you need help, ask a member of staff.",
  },
  "vitals-waiting-area-tv-display": {
    eyebrow: "MATERNITY & TRIAGE",
    headline: "A calm, caring welcome for every family.",
    body: "The Vitals & Triage team will call your ticket when it is time for your next step.",
  },
  "main-waiting-area-tv-display": {
    eyebrow: "WELCOME TO MUM’S CARE",
    headline: "Every visit starts with a clear next step.",
    body: "Please watch for your number. Our care team will guide you to the right service.",
  },
};

function displayCopyFor(slug: PublicDisplaySlug, value: unknown): PublicDisplayCopy {
  const fallback = publicDisplayMessages[slug];
  const allContent = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const configured = allContent[slug] && typeof allContent[slug] === "object" && !Array.isArray(allContent[slug])
    ? allContent[slug] as Record<string, unknown>
    : {};
  return {
    eyebrow: typeof configured.eyebrow === "string" && configured.eyebrow.trim() ? configured.eyebrow : fallback.eyebrow,
    headline: typeof configured.headline === "string" && configured.headline.trim() ? configured.headline : fallback.headline,
    body: typeof configured.body === "string" && configured.body.trim() ? configured.body : fallback.body,
  };
}

type PublicQueueEntry = Pick<QueueEntry, "ticketNumber" | "department" | "status" | "checkedInAt"> & { calledAt?: string | null };

interface PublicDepartmentCount {
  department: Department;
  waiting: number;
  called: number;
  inProgress: number;
}

function newestEntry(entries: PublicQueueEntry[]): PublicQueueEntry | undefined {
  return [...entries].sort((a, b) => new Date(b.calledAt ?? b.checkedInAt).getTime() - new Date(a.calledAt ?? a.checkedInAt).getTime())[0];
}

function setPublicDisplaySoundEnabled(enabled: boolean): boolean {
  if (enabled) {
    if (typeof window.AudioContext === "undefined") return false;
    try {
      publicDisplayAudioContext ??= new AudioContext();
      void publicDisplayAudioContext.resume().catch(() => {});
    } catch { return false; }
  }
  publicDisplaySoundEnabled = enabled;
  try { localStorage.setItem(publicDisplaySoundPreferenceKey, enabled ? "enabled" : "disabled"); }
  catch { /* Sound preference remains active for the current session. */ }
  return true;
}

function playPublicCallChime(): void {
  const context = publicDisplayAudioContext;
  if (!publicDisplaySoundEnabled || !context || context.state !== "running") return;
  const startAt = context.currentTime + 0.02;
  for (const [index, frequency] of [880, 1174].entries()) {
    const start = startAt + index * 0.17;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  }
}

function observePublicCall(slug: PublicDisplaySlug, entries: PublicQueueEntry[]): void {
  const called = newestEntry(entries.filter((entry) => entry.status === "called"));
  const calledKey = called ? `${called.ticketNumber}:${called.calledAt ?? called.checkedInAt}` : null;
  if (lastPublicCallDisplaySlug !== slug || lastPublicCalledKey === undefined) {
    lastPublicCallDisplaySlug = slug;
    lastPublicCalledKey = calledKey;
    return;
  }
  if (calledKey && calledKey !== lastPublicCalledKey) playPublicCallChime();
  lastPublicCalledKey = calledKey;
}

function renderPublicDisplay(screen: StitchScreen, entries: PublicQueueEntry[], displayEnabled: boolean, counts: PublicDepartmentCount[], content?: unknown, libraryValue?: unknown): string {
  const slug = screen.slug as PublicDisplaySlug;
  if (!displayEnabled) {
    return `<section class="public-display public-display-disabled" data-display="${slug}"><div class="display-disabled-panel"><img src="/mums-care-logo.png" alt="Mum’s Care Hospital"/><span class="display-section-kicker">PATIENT DISPLAY</span><span class="display-disabled-icon material-symbols-outlined" aria-hidden="true">tv_off</span><h1>Patient display paused</h1><p>Public queue displays are currently disabled for this facility. Please ask a member of the care team for assistance.</p></div></section>`;
  }
  const library = readPublicDisplayLibrary(libraryValue);
  const marqueeMessages = library.announcements.map((item) => item.body.trim()).filter(Boolean);
  if (!marqueeMessages.length) marqueeMessages.push("Please keep your ticket number ready. Our care team will guide you to the next step.");
  const marqueeSourceLength = marqueeMessages.reduce((length, message) => length + message.length, 0);
  const marqueeRepeatCount = Math.max(2, Math.ceil(180 / Math.max(1, marqueeSourceLength)));
  const marqueeCycleMessages = Array.from({ length: marqueeRepeatCount }, (_unused, index) => marqueeMessages[index % marqueeMessages.length]!);
  const marqueeContent = marqueeCycleMessages.map((message) => `<span>${escapeHtml(message)}</span>`).join(`<span class="display-marquee-separator" aria-hidden="true">✦</span>`);
  const marqueeDuration = Math.min(60, Math.max(24, Math.round(marqueeCycleMessages.reduce((length, message) => length + message.length, 0) * 0.3)));
  const marqueeNow = publicDisplayMarqueePausedAt ?? Date.now();
  const marqueeElapsed = Math.max(0, marqueeNow - publicDisplayMarqueeStartedAt - publicDisplayMarqueeTotalPausedMs);
  const marqueeAnimationDelay = -((marqueeElapsed / 1000) % marqueeDuration);
  const displayFeatures = [
    ...library.adverts.map((item) => ({ eyebrow: item.category || "WAITING AREA", headline: item.title, body: item.description, imageUrl: item.imageUrl, icon: "campaign" })),
    ...library.services.map((item) => ({ eyebrow: "SERVICES OFFERED", headline: item.title, body: item.description, imageUrl: "", icon: item.icon || "medical_services" })),
    ...library.teamMembers.map((item) => ({ eyebrow: "MEET OUR TEAM", headline: item.name, body: `${item.role}${item.department ? ` · ${item.department}` : ""}`, imageUrl: item.photoUrl, icon: "person" })),
    ...library.announcements.map((item) => ({ eyebrow: "PATIENT ANNOUNCEMENT", headline: "Please note", body: item.body, imageUrl: "", icon: "campaign" })),
  ];
  const selectedFeature = displayFeatures.length ? displayFeatures[Math.floor(Date.now() / 20_000) % displayFeatures.length]! : null;
  const copy = selectedFeature ?? displayCopyFor(slug, content);
  const careImageUrl = selectedFeature ? safeDisplayImageUrl(selectedFeature.imageUrl) : "";
  const displayDepartments: readonly Department[] = slug === "vitals-waiting-area-tv-display" ? ["vitals"] : departmentOrder;
  const currentCall = newestEntry(entries.filter((entry) => entry.status === "called"))
    ?? newestEntry(entries.filter((entry) => entry.status === "in_progress"));
  observePublicCall(slug, entries);
  const waitingTotal = counts.reduce((sum, row) => sum + numberValue(row.waiting), 0);
  const now = new Date();
  const timeText = new Intl.DateTimeFormat("en-ZM", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const dateText = new Intl.DateTimeFormat("en-ZM", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const isFullscreen = document.fullscreenElement === workspaceShell;
  const fullscreenLabel = isFullscreen ? "Exit full screen" : "Extend to full screen";
  const departmentCards = displayDepartments.map((department) => {
    const departmentEntries = entries.filter((entry) => entry.department === department);
    const waitingCount = numberValue(counts.find((row) => row.department === department)?.waiting);
    const active = newestEntry(departmentEntries.filter((entry) => entry.status === "called"))
      ?? newestEntry(departmentEntries.filter((entry) => entry.status === "in_progress"));
    const upNext = departmentEntries.filter((entry) => entry.status === "waiting");
    const waitingLabel = waitingCount === 1 ? "1 person waiting" : `${waitingCount} people waiting`;
    return `<article class="display-department-card">
      <header class="display-department-heading"><span class="display-department-icon material-symbols-outlined" aria-hidden="true">${departmentIcons[department]}</span><div><h3>${escapeHtml(departmentLabels[department])}</h3><span>${waitingLabel}</span></div><span class="display-department-count">${waitingCount}</span></header>
      <div class="display-department-current">${active ? `<span>${active.status === "called" ? "CALLED NOW" : "IN SERVICE"}</span><strong>${escapeHtml(active.ticketNumber)}</strong>` : `<span>NOW SERVING</span><strong class="display-ticket-placeholder">—</strong>`}</div>
      <footer class="display-up-next"><span>UP NEXT</span>${upNext.length ? `<div>${upNext.slice(0, 3).map((entry) => `<span>${escapeHtml(entry.ticketNumber)}</span>`).join("")}${waitingCount > 3 ? `<small>+${waitingCount - 3} more</small>` : ""}</div>` : `<small>Queue clear</small>`}</footer>
    </article>`;
  }).join("");
  return `<section class="public-display" data-display="${slug}">
    <header class="public-display-brand">
      <div class="display-brand-lockup"><span class="public-display-logo"><img src="/mums-care-logo.png" alt="Mum’s Care Hospital"/></span><span class="display-brand-caption">QUEUE &amp; PATIENT FLOW</span></div>
      <div class="display-live-status"><span class="display-live-dot"></span><span><strong>Live queue</strong><small>${waitingTotal} ${waitingTotal === 1 ? "person" : "people"} waiting</small></span></div>
      <div class="display-clock-group"><button class="display-fullscreen-toggle" type="button" data-display-fullscreen aria-label="${fullscreenLabel}" aria-pressed="${isFullscreen}" title="${fullscreenLabel}"><span class="material-symbols-outlined" aria-hidden="true">${isFullscreen ? "fullscreen_exit" : "fullscreen"}</span><span class="display-fullscreen-label">${fullscreenLabel}</span></button><div class="display-clock"><time datetime="${now.toISOString()}">${timeText}</time><span>${dateText}</span></div></div>
    </header>
    <div class="public-display-layout">
      <main class="public-display-main">
        <section class="display-now-card" aria-label="Current ticket call">
          <div class="display-now-top"><h1>Now serving</h1><div class="display-now-controls"><span><i></i>${waitingTotal} waiting across this display</span><button class="display-sound-toggle" type="button" data-public-display-sound aria-pressed="${publicDisplaySoundEnabled}" aria-label="${publicDisplaySoundEnabled ? "Disable" : "Enable"} call sound" title="${publicDisplaySoundEnabled ? "Call sound on" : "Enable call sound"}"><span class="material-symbols-outlined" aria-hidden="true">${publicDisplaySoundEnabled ? "volume_up" : "volume_off"}</span><span>${publicDisplaySoundEnabled ? "Sound on" : "Enable sound"}</span></button></div></div>
          ${currentCall ? `<div class="display-current-ticket"><span class="display-ticket-caption">${currentCall.status === "called" ? "PLEASE PROCEED" : "CURRENTLY IN SERVICE"}</span><strong>${escapeHtml(currentCall.ticketNumber)}</strong></div><div class="display-current-destination"><span class="material-symbols-outlined" aria-hidden="true">north_east</span><div><small>PLEASE GO TO</small><strong>${escapeHtml(formatDepartment(currentCall.department))}</strong></div><span class="display-call-status">${currentCall.status === "called" ? "Called now" : "In service"}</span></div>` : `<div class="display-no-call"><span class="material-symbols-outlined" aria-hidden="true">notifications_active</span><div><strong>Your next call is coming soon.</strong><small>Please keep your ticket number close and wait for it to appear here.</small></div></div>`}
        </section>
        <div class="display-queue-heading"><div><span class="display-section-kicker">LIVE QUEUE</span><h2>By service area</h2></div><span class="display-update-label"><i></i> Updates automatically</span></div>
        <div class="display-departments" data-count="${displayDepartments.length}">${departmentCards}</div>
      </main>
      <aside class="display-care-card">
        <div class="display-care-photo" aria-hidden="true"${careImageUrl ? ` style="--display-care-image: url(&quot;${escapeHtml(careImageUrl)}&quot;)"` : ""}></div>
        <div class="display-care-art" aria-hidden="true"><span class="display-care-orbit display-care-orbit-one"></span><span class="display-care-orbit display-care-orbit-two"></span><span class="display-care-emblem"><span class="material-symbols-outlined">${escapeHtml(selectedFeature?.icon ?? "health_and_safety")}</span></span><span class="display-care-spark display-care-spark-one">✦</span><span class="display-care-spark display-care-spark-two">✧</span></div>
        <div class="display-care-content"><span class="display-care-eyebrow"><i></i>${escapeHtml(copy.eyebrow)}</span><h2>${escapeHtml(copy.headline)}</h2><p>${escapeHtml(copy.body)}</p><div class="display-help-card"><span class="material-symbols-outlined" aria-hidden="true">support_agent</span><span><strong>Need assistance?</strong><small>Please speak to a member of staff.</small></span><span class="material-symbols-outlined display-help-arrow" aria-hidden="true">arrow_forward</span></div></div>
        <span class="display-care-signoff">MUM’S CARE <i></i> HERE FOR YOU</span>
      </aside>
    </div>
    <footer class="public-display-footer"><div class="display-footer-marquee" role="group" aria-label="Patient announcements"><span class="display-marquee-label"><span class="material-symbols-outlined" aria-hidden="true">campaign</span><span>Announcements</span></span><div class="display-marquee-viewport"><div class="display-marquee-track${publicDisplayMarqueePaused ? " is-paused" : ""}" style="--display-marquee-duration:${marqueeDuration}s;animation-delay:${marqueeAnimationDelay}s"><div class="display-marquee-group">${marqueeContent}</div><div class="display-marquee-group" aria-hidden="true">${marqueeContent}</div></div></div><button class="display-marquee-toggle" type="button" data-marquee-toggle aria-label="${publicDisplayMarqueePaused ? "Resume" : "Pause"} scrolling announcements" aria-pressed="${publicDisplayMarqueePaused}" title="${publicDisplayMarqueePaused ? "Resume" : "Pause"} scrolling announcements"><span class="material-symbols-outlined" aria-hidden="true">${publicDisplayMarqueePaused ? "play_arrow" : "pause"}</span></button></div></footer>
  </section>`;
}

async function renderPage(slug: ScreenSlug): Promise<string> {
  const screen = screens.find((entry) => entry.slug === slug)!;
  switch (slug) {
    case "account-access-pending":
      return `${pageHeading(screen, "ACCOUNT SECURITY")}<section class="role-pending-card"><span class="role-pending-icon material-symbols-outlined" aria-hidden="true">lock_person</span><span class="role-access-eyebrow">SECURE WORKSPACE</span><h2>Your access is not assigned yet</h2><p>Your account is active, but it cannot view patient or facility information until a facility administrator assigns a care team role.</p><span class="role-pending-account"><span class="material-symbols-outlined" aria-hidden="true">account_circle</span>${escapeHtml(currentUser?.fullName ?? "Team member")} · Role assignment needed</span><button class="button button-secondary" id="refresh-role-access" type="button">Sign in to check access</button></section>`;
    case "hospital-command-centre": return renderCommandCentre();
    case "admin-panel": return renderAdminPanel(screen);
    case "facility-operations-command-center": return renderOperations(screen);
    case "queue-configuration-studio": {
      const facility = await loadFacility();
      return renderConfiguration(screen, facility, currentUser?.accountRole === "admin");
    }
    case "hospital-flow-settings": {
      const [facility, staff, invites] = await Promise.all([
        loadFacility(),
        loadStaff(),
        api<{ inviteCodes: FacilityInviteCode[] }>("/api/facility/invite-codes"),
      ]);
      return renderSettings(screen, facility, currentUser?.accountRole === "admin", staff, invites.inviteCodes);
    }
    case "system-settings": {
      const [facility, staff] = await Promise.all([loadFacility(), loadStaff()]);
      return renderSystemSettings(screen, facility, staff);
    }
    case "opd-reception-patient-check-in": return renderCheckIn(screen, await loadQueue("reception"));
    case "vitals-station": return renderVitalsWorkstation(await loadQueue("vitals"));
    case "consultation-room": return renderClinicalQueue(screen, "consultation", await loadQueue("consultation"), await loadStaff());
    case "laboratory": return renderClinicalQueue(screen, "laboratory", await loadQueue("laboratory"), await loadStaff());
    case "radiology-ultrasound": return renderClinicalQueue(screen, "radiology", await loadQueue("radiology"), await loadStaff());
    case "pharmacy": return renderClinicalQueue(screen, "pharmacy", await loadQueue("pharmacy"), await loadStaff());
    case "patient-display": return renderPatientDisplayDirectory(screen);
    case "waiting-tv-displays": {
      const [facility, queue] = await Promise.all([loadFacility(), api<{ queue: PublicQueueEntry[]; counts: PublicDepartmentCount[] }>("/api/public/queue")]);
      return renderOperationsScreens(screen, facility.settings.publicDisplayEnabled === true, queue.counts);
    }
    case "audio-announcement-broadcast-tv-display":
    case "vitals-waiting-area-tv-display":
    case "main-waiting-area-tv-display": {
      const department = slug === "vitals-waiting-area-tv-display" ? "vitals" : undefined;
      const query = department ? `?department=${department}` : "";
      const result = await api<{ queue: PublicQueueEntry[]; counts: PublicDepartmentCount[]; enabled: boolean; displayContent?: PublicDisplayContent; patientDisplayLibrary?: unknown }>(`/api/public/queue${query}`);
      return renderPublicDisplay(screen, result.queue, result.enabled, result.counts, result.displayContent, result.patientDisplayLibrary);
    }
  }
}

function showToast(message: string, tone: "success" | "error" = "success"): void {
  let toast = document.querySelector<HTMLDivElement>("#workspace-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "workspace-toast";
    toast.className = "workspace-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.dataset.tone = tone;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove("is-visible"), 3800);
}

function watchConnectedMonitors(details: ManagedScreenDetails): void {
  if (watchedMonitorDetails && monitorChangeHandler) {
    watchedMonitorDetails.removeEventListener("screenschange", monitorChangeHandler);
  }
  watchedMonitorDetails = details;
  monitorChangeHandler = () => {
    if (monitorDetection.kind !== "detected" || monitorDetection.details !== details) return;
    monitorDetection = { kind: "detected", details };
    if (activeScreenSlug === "system-settings") void refreshCurrent();
  };
  details.addEventListener("screenschange", monitorChangeHandler);
}

async function detectConnectedMonitors(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.innerHTML = `<span class="loading-spinner" aria-hidden="true"></span> Scanning displays…`;
  const getScreenDetails = (window as WindowWithManagedScreens).getScreenDetails;
  if (!getScreenDetails) {
    const extended = (window.screen as ScreenWithExtended).isExtended;
    monitorDetection = { kind: "unsupported", extended: typeof extended === "boolean" ? extended : null };
    await refreshCurrent();
    return;
  }
  try {
    const details = await getScreenDetails.call(window);
    monitorDetection = { kind: "detected", details };
    watchConnectedMonitors(details);
    await refreshCurrent();
    if (details.screens.length > 1) showToast(`${details.screens.length} monitors detected and ready for patient displays.`);
    else showToast("One display detected. Connect an extended monitor to add another patient display.");
  } catch (error) {
    const reason = error instanceof Error && error.name === "NotAllowedError"
      ? "Permission was not granted. Allow this site to manage windows across displays, then try again."
      : error instanceof Error && error.name === "SecurityError"
        ? "This browser requires a secure connection and display permission before it can scan monitors."
        : "The browser could not scan displays. Check site permissions and try again.";
    monitorDetection = { kind: "denied", message: reason };
    await refreshCurrent();
    showToast("Monitor access was not available.", "error");
  }
}

function openPatientDisplayOnMonitor(button: HTMLButtonElement): void {
  if (monitorDetection.kind !== "detected") {
    showToast("Scan for connected monitors before opening a patient display.", "error");
    return;
  }
  const index = Number(button.dataset.openMonitor);
  const monitor = monitorDetection.details.screens[index];
  const picker = screenRoot.querySelector<HTMLSelectElement>("#monitor-display-choice");
  const slug = picker?.value;
  if (!monitor || !slug || !publicDisplaySlugs.includes(slug as PublicDisplaySlug)) return;
  const left = Math.round(monitor.availLeft ?? monitor.left ?? 0);
  const top = Math.round(monitor.availTop ?? monitor.top ?? 0);
  const width = Math.max(640, Math.round(monitor.availWidth || monitor.width));
  const height = Math.max(480, Math.round(monitor.availHeight || monitor.height));
  const target = `mums-care-patient-display-monitor-${index + 1}`;
  const features = `popup=yes,left=${left},top=${top},width=${width},height=${height},resizable=yes,scrollbars=yes`;
  const displayUrl = new URL(screenHref(slug as PublicDisplaySlug), location.href);
  displayUrl.searchParams.set("display", "1");
  const displayWindow = window.open(`${displayUrl.pathname}${displayUrl.search}`, target, features);
  if (!displayWindow) {
    showToast("Allow pop-ups for this site to open a patient display window.", "error");
    return;
  }
  try {
    displayWindow.moveTo(left, top);
    displayWindow.resizeTo(width, height);
  } catch { /* The browser can restrict window placement after opening. */ }
  const monitorName = monitor.label?.trim() || (monitor.isPrimary ? "the primary display" : `monitor ${index + 1}`);
  showToast(`Patient display opened on ${monitorName}. Your browser may limit window placement.`);
}

function screenLoading(screen: StitchScreen): void {
  if (isPublicDisplayScreen(screen.slug as ScreenSlug)) {
    screenRoot.innerHTML = `<div class="public-display-preload"><span class="public-display-logo"><img src="/mums-care-logo.png" alt="Mum’s Care Hospital"/></span><span class="loading-spinner" aria-hidden="true"></span><span>Preparing the live waiting display…</span></div>`;
    return;
  }
  screenRoot.innerHTML = `<div class="screen-content">${screenPageHeading(screen)}<div class="loading-panel"><span class="loading-spinner" aria-hidden="true"></span><span>Loading live facility data…</span></div></div>`;
}

async function showScreen(slug: ScreenSlug, historyMode: "push" | "replace" | "none" = "push"): Promise<void> {
  const screen = screens.find((entry) => entry.slug === slug);
  if (!screen) return;
  if (currentUser && !canAccessScreen(currentUser.accountRole, slug)) {
    showToast("Your account does not have access to that workspace.", "error");
    await showScreen(defaultScreenForRole(currentUser.accountRole), historyMode === "none" ? "none" : "replace");
    return;
  }
  const screenChanged = activeScreenSlug !== slug;
  if (screenChanged) {
    lastPublicCallDisplaySlug = null;
    lastPublicCalledKey = undefined;
  }
  const standaloneDisplay = isPublicDisplayScreen(slug) && new URL(location.href).searchParams.get("display") === "1";
  activeScreenSlug = slug;
  if (screenChanged || historyMode !== "none") screenRoot.scrollTop = 0;
  window.clearInterval(liveRefreshTimer);
  workspaceShell.hidden = false;
  workspaceShell.classList.toggle("patient-display-mode", standaloneDisplay);
  workspaceShell.classList.toggle("patient-display-sidebar-mode", isPublicDisplayScreen(slug) && !standaloneDisplay);
  authRoot.hidden = true;
  document.documentElement.classList.remove("auth-active");
  document.body.classList.remove("auth-active");
  updateNavigation(slug);
  document.title = `${screen.title} · Mum’s Care`;
  if (historyMode !== "none") {
    const url = new URL(location.href);
    url.searchParams.set("screen", slug);
    url.searchParams.delete("auth");
    url.searchParams.delete("view");
    if (slug !== "admin-panel") url.searchParams.delete("adminTab");
    if (!isPublicDisplayScreen(slug)) url.searchParams.delete("display");
    if (historyMode === "push") history.pushState({ screen: slug }, "", url);
    else history.replaceState({ screen: slug }, "", url);
  }
  screenLoading(screen);
  try {
    screenRoot.innerHTML = `<div class="screen-content">${await renderPage(slug)}</div>`;
    wirePageInteractions();
    if (["hospital-command-centre", "admin-panel", "facility-operations-command-center", "opd-reception-patient-check-in", "vitals-station", "consultation-room", "laboratory", "radiology-ultrasound", "pharmacy", "waiting-tv-displays", "audio-announcement-broadcast-tv-display", "vitals-waiting-area-tv-display", "main-waiting-area-tv-display"].includes(slug)) {
      liveRefreshTimer = window.setInterval(() => {
        if (document.hidden || (!isPublicDisplayScreen(slug) && screenRoot.querySelector(":focus"))) return;
        void refreshSilently();
      }, isPublicDisplayScreen(slug) ? 5_000 : 20_000);
    }
    if (historyMode !== "none") {
      const heading = screenRoot.querySelector<HTMLElement>("h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    }
  } catch (error) {
    if ((error as { status?: number }).status === 401) {
      currentUser = null;
      const url = new URL(location.href);
      url.searchParams.delete("screen");
      url.searchParams.set("auth", "login");
      history.replaceState({ auth: "login" }, "", url);
      renderCurrentPage("none");
      return;
    }
    screenRoot.innerHTML = isPublicDisplayScreen(slug)
      ? `<div class="public-display-error"><span class="material-symbols-outlined" aria-hidden="true">cloud_off</span><h1>Waiting display unavailable</h1><p>${escapeHtml(error instanceof Error ? error.message : "Check the connection and try again.")}</p><button type="button" class="button button-primary" data-refresh>Try again</button></div>`
      : `<div class="screen-content">${pageHeading(screen)}<section class="error-state"><span class="material-symbols-outlined" aria-hidden="true">cloud_off</span><h2>Couldn’t load live facility data</h2><p>${escapeHtml(error instanceof Error ? error.message : "Check your connection and try again.")}</p><button type="button" class="button button-primary" data-refresh>Try again</button></section></div>`;
    wirePageInteractions();
  }
}

function jsonBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

async function refreshCurrent(): Promise<void> {
  await showScreen(activeScreenSlug, "none");
}

async function refreshSilently(): Promise<void> {
  if (silentRefreshInFlight || !currentUser) return;
  const slug = activeScreenSlug;
  const scrollTop = screenRoot.scrollTop;
  const restoreDisplayControlFocus = isPublicDisplayScreen(slug)
    && document.activeElement instanceof HTMLElement
    && document.activeElement.matches("[data-public-display-sound], [data-marquee-toggle]");
  silentRefreshInFlight = true;
  try {
    const html = await renderPage(slug);
    if (slug !== activeScreenSlug) return;
    screenRoot.innerHTML = `<div class="screen-content">${html}</div>`;
    wirePageInteractions();
    screenRoot.scrollTop = scrollTop;
    if (restoreDisplayControlFocus) screenRoot.querySelector<HTMLButtonElement>("[data-public-display-sound], [data-marquee-toggle]")?.focus({ preventScroll: true });
  } catch (error) {
    if ((error as { status?: number }).status === 401) {
      currentUser = null;
      const url = new URL(location.href);
      url.searchParams.delete("screen");
      url.searchParams.set("auth", "login");
      history.replaceState({ auth: "login" }, "", url);
      window.clearInterval(liveRefreshTimer);
      await renderCurrentPage("none");
    }
  } finally {
    silentRefreshInFlight = false;
  }
}

function wirePageInteractions(): void {
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-display-fullscreen]")) {
    button.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === workspaceShell) {
          await document.exitFullscreen();
          return;
        }
        if (!document.fullscreenEnabled || typeof workspaceShell.requestFullscreen !== "function") {
          showToast("Full-screen mode is not available in this browser.", "error");
          return;
        }
        await workspaceShell.requestFullscreen();
      } catch {
        showToast("The patient display could not enter full-screen mode.", "error");
      }
    });
  }
  const adminTablist = screenRoot.querySelector<HTMLElement>('[role="tablist"][aria-label="Administration workspace"]');
  const adminTabs = [...screenRoot.querySelectorAll<HTMLButtonElement>("[data-admin-tab]")];
  const activateAdminTab = (tab: HTMLButtonElement, moveFocus = false): void => {
    const id = tab.dataset.adminTab;
    if (!id) return;
    for (const item of adminTabs) {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
      const panel = screenRoot.querySelector<HTMLElement>(`#${CSS.escape(item.getAttribute("aria-controls") ?? "")}`);
      if (panel) panel.hidden = !active;
    }
    const url = new URL(location.href);
    url.searchParams.set("screen", "admin-panel");
    url.searchParams.set("adminTab", id);
    url.searchParams.delete("view");
    history.replaceState({ screen: "admin-panel", adminTab: id }, "", url);
    if (moveFocus) tab.focus({ preventScroll: true });
  };
  for (const tab of adminTabs) tab.addEventListener("click", () => activateAdminTab(tab));
  adminTablist?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const current = adminTabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0 || !adminTabs.length) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? adminTabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : adminTabs.length - 1)) % adminTabs.length;
    activateAdminTab(adminTabs[next]!, true);
  });
  const displayEntryDialog = screenRoot.querySelector<HTMLDialogElement>("#display-content-dialog");
  const displayEntryForm = screenRoot.querySelector<HTMLFormElement>("#display-content-entry-form");
  const displayEntryFields = screenRoot.querySelector<HTMLElement>("#display-content-dialog-fields");
  const displayCategoryCopy: Record<DisplayContentCategory, { title: string; description: string; icon: string }> = {
    adverts: { title: "Waiting-area advert", description: "Add a photo and a short promotion for the waiting display.", icon: "image" },
    services: { title: "Service offered", description: "Describe a service patients can receive at this facility.", icon: "medical_services" },
    teamMembers: { title: "Team profile", description: "Introduce a team member on the patient display.", icon: "person" },
    announcements: { title: "Patient announcement", description: "Create a short, static notice for the waiting area.", icon: "campaign" },
  };
  const displayItems = (category: DisplayContentCategory): PatientDisplayItem[] => (currentPatientDisplayLibrary?.[category] ?? []) as PatientDisplayItem[];
  const openDisplayEntryDialog = (category: DisplayContentCategory, entry?: PatientDisplayItem): void => {
    if (!displayEntryDialog || !displayEntryForm || !displayEntryFields) return;
    const copy = displayCategoryCopy[category];
    displayEntryDialog.dataset.category = category;
    displayEntryDialog.dataset.entryId = entry?.id ?? "";
    displayEntryForm.reset();
    displayEntryFields.innerHTML = displayEntryFieldsMarkup(category, entry);
    const title = displayEntryDialog.querySelector<HTMLElement>("#display-content-dialog-title");
    const description = displayEntryDialog.querySelector<HTMLElement>("#display-content-dialog-description");
    const icon = displayEntryDialog.querySelector<HTMLElement>("#display-content-dialog-icon");
    if (title) title.textContent = entry ? `Edit ${copy.title.toLocaleLowerCase("en")}` : `Add ${copy.title.toLocaleLowerCase("en")}`;
    if (description) description.textContent = entry ? "Update this item for your patient displays." : copy.description;
    if (icon) icon.textContent = copy.icon;
    if (!displayEntryDialog.open) displayEntryDialog.showModal();
    displayEntryFields.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")?.focus({ preventScroll: true });
  };
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-display-item-add]")) {
    button.addEventListener("click", () => {
      const category = button.dataset.displayItemAdd as DisplayContentCategory | undefined;
      if (category && category in displayCategoryCopy) openDisplayEntryDialog(category);
    });
  }
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-display-item-edit]")) {
    button.addEventListener("click", () => {
      const category = button.dataset.displayItemEdit as DisplayContentCategory | undefined;
      const entry = displayItems(category as DisplayContentCategory).find((item) => item.id === button.dataset.entryId);
      if (category && category in displayCategoryCopy && entry) openDisplayEntryDialog(category, entry);
    });
  }
  const savePatientDisplayLibrary = async (library: PatientDisplayLibrary, successMessage: string, button?: HTMLButtonElement): Promise<void> => {
    if (button) button.disabled = true;
    try {
      await api("/api/facility/settings", { method: "PATCH", body: JSON.stringify({ patientDisplayLibrary: library }) });
      currentPatientDisplayLibrary = library;
      displayEntryDialog?.close();
      showToast(successMessage);
      await refreshCurrent();
    } catch (error) {
      if (button) button.disabled = false;
      showToast(error instanceof Error ? error.message : "Display content could not be saved.", "error");
    }
  };
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-display-item-remove]")) {
    button.addEventListener("click", async () => {
      const category = button.dataset.displayItemRemove as DisplayContentCategory | undefined;
      const id = button.dataset.entryId;
      const library = currentPatientDisplayLibrary;
      if (!category || !(category in displayCategoryCopy) || !id || !library) return;
      const entry = displayItems(category).find((item) => item.id === id);
      if (!entry) return;
      const label = "title" in entry ? entry.title : "name" in entry ? entry.name : "body" in entry ? entry.body : "this item";
      if (!window.confirm(`Delete “${label.slice(0, 80)}” from patient displays?`)) return;
      const nextItems = displayItems(category).filter((item) => item.id !== id);
      await savePatientDisplayLibrary(updateDisplayLibraryCategory(library, category, nextItems), "Display item deleted.", button);
    });
  }
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-display-item-toggle]")) {
    button.addEventListener("click", async () => {
      const category = button.dataset.displayItemToggle as DisplayContentCategory | undefined;
      const id = button.dataset.entryId;
      const library = currentPatientDisplayLibrary;
      if (!category || !(category in displayCategoryCopy) || !id || !library) return;
      const nextItems = displayItems(category).map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item);
      const changedItem = nextItems.find((item) => item.id === id);
      await savePatientDisplayLibrary(updateDisplayLibraryCategory(library, category, nextItems), changedItem?.enabled ? "Content is now shown on patient displays." : "Content is hidden from patient displays.", button);
    });
  }
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-display-dialog-close]")) {
    button.addEventListener("click", () => displayEntryDialog?.close());
  }
  displayEntryDialog?.addEventListener("click", (event) => {
    if (event.target === displayEntryDialog) displayEntryDialog.close();
  });
  displayEntryFields?.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement) || !["imageUrl", "photoUrl"].includes(event.target.name)) return;
    const preview = displayEntryFields.querySelector<HTMLImageElement>("#display-entry-image-preview");
    const empty = displayEntryFields.querySelector<HTMLElement>("#display-entry-image-empty");
    const url = safeDisplayImageUrl(event.target.value);
    if (preview) {
      preview.hidden = !url;
      if (url) preview.src = url;
    }
    if (empty) empty.hidden = Boolean(url);
  });
  displayEntryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const category = displayEntryDialog?.dataset.category as DisplayContentCategory | undefined;
    const id = displayEntryDialog?.dataset.entryId || `display-${crypto.randomUUID()}`;
    const library = currentPatientDisplayLibrary;
    if (!category || !(category in displayCategoryCopy) || !library) return;
    const data = new FormData(form);
    const existing = displayItems(category).find((item) => item.id === id);
    const enabled = existing?.enabled ?? true;
    const imageRaw = String(data.get(category === "teamMembers" ? "photoUrl" : "imageUrl") ?? "").trim();
    const imageUrl = safeDisplayImageUrl(imageRaw);
    if (imageRaw && !imageUrl) {
      showToast("Use a secure image URL or a path within this facility workspace.", "error");
      return;
    }
    let item: PatientDisplayItem;
    if (category === "adverts") {
      item = { id, title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim(), category: String(data.get("category") ?? "").trim(), imageUrl, enabled };
    } else if (category === "services") {
      item = { id, title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim(), icon: String(data.get("icon") ?? "stethoscope"), enabled };
    } else if (category === "teamMembers") {
      item = { id, name: String(data.get("name") ?? "").trim(), role: String(data.get("role") ?? "").trim(), department: String(data.get("department") ?? "").trim(), photoUrl: imageUrl, enabled };
    } else {
      item = { id, body: String(data.get("body") ?? "").trim(), enabled };
    }
    const currentItems = displayItems(category);
    const nextItems = existing ? currentItems.map((current) => current.id === id ? item : current) : [...currentItems, item];
    const libraryNext = updateDisplayLibraryCategory(library, category, nextItems);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    await savePatientDisplayLibrary(libraryNext, existing ? "Display content updated." : "Display content added.", submit ?? undefined);
  });
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-refresh]")) button.addEventListener("click", () => void refreshCurrent());
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-queue-department][data-queue-offset]")) {
    button.addEventListener("click", async () => {
      const department = button.dataset.queueDepartment as Department | undefined;
      const offset = Number(button.dataset.queueOffset);
      if (!department || !departmentOrder.includes(department) || !Number.isSafeInteger(offset) || offset < 0) return;
      queuePageOffsets.set(department, offset);
      await refreshCurrent();
      screenRoot.querySelector<HTMLElement>(".queue-page-summary")?.focus({ preventScroll: true });
    });
  }
  screenRoot.querySelector<HTMLButtonElement>("#refresh-role-access")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Checking access…";
    try {
      const session = await api<{ authenticated: boolean; user: AuthUser | null }>("/api/auth/session");
      if (!session.authenticated || !session.user) {
        currentUser = null;
        const url = new URL(location.href);
        url.searchParams.delete("screen");
        url.searchParams.set("auth", "login");
        history.replaceState({ auth: "login" }, "", url);
        await renderCurrentPage("none");
        return;
      }
      currentUser = session.user;
      setUserChrome(session.user);
      const homeScreen = defaultScreenForRole(session.user.accountRole);
      if (homeScreen !== "account-access-pending") {
        await showScreen(homeScreen, "replace");
        showToast(`Access assigned: ${ACCOUNT_ROLE_DEFINITIONS[session.user.accountRole].label}.`);
      } else {
        button.disabled = false;
        button.textContent = "Sign in to check access";
        showToast("Your access is still pending. Ask your facility administrator to assign a role.");
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = "Sign in to check access";
      showToast(error instanceof Error ? error.message : "Access status could not be checked.", "error");
    }
  });
  screenRoot.querySelector<HTMLButtonElement>("[data-public-display-sound]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const enabled = !publicDisplaySoundEnabled;
    if (!setPublicDisplaySoundEnabled(enabled)) {
      showToast("Call sound is not available in this browser.", "error");
      return;
    }
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} call sound`);
    button.title = enabled ? "Call sound on" : "Enable call sound";
    const icon = button.querySelector<HTMLElement>(".material-symbols-outlined");
    if (icon) icon.textContent = enabled ? "volume_up" : "volume_off";
    const label = button.querySelector<HTMLElement>("span:last-child");
    if (label) label.textContent = enabled ? "Sound on" : "Enable sound";
  });
  screenRoot.querySelector<HTMLButtonElement>("[data-marquee-toggle]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    publicDisplayMarqueePaused = !publicDisplayMarqueePaused;
    if (publicDisplayMarqueePaused) publicDisplayMarqueePausedAt = Date.now();
    else if (publicDisplayMarqueePausedAt !== null) {
      publicDisplayMarqueeTotalPausedMs += Date.now() - publicDisplayMarqueePausedAt;
      publicDisplayMarqueePausedAt = null;
    }
    const label = `${publicDisplayMarqueePaused ? "Resume" : "Pause"} scrolling announcements`;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(publicDisplayMarqueePaused));
    button.title = label;
    const icon = button.querySelector<HTMLElement>(".material-symbols-outlined");
    if (icon) icon.textContent = publicDisplayMarqueePaused ? "play_arrow" : "pause";
    screenRoot.querySelector<HTMLElement>(".display-marquee-track")?.classList.toggle("is-paused", publicDisplayMarqueePaused);
  });
  screenRoot.querySelector<HTMLButtonElement>("#detect-monitors")?.addEventListener("click", (event) => {
    void detectConnectedMonitors(event.currentTarget as HTMLButtonElement);
  });
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-open-monitor]")) {
    button.addEventListener("click", () => openPatientDisplayOnMonitor(button));
  }
  const checkInDialog = screenRoot.querySelector<HTMLDialogElement>("#checkin-dialog");
  screenRoot.querySelector<HTMLButtonElement>("#open-checkin-dialog")?.addEventListener("click", () => {
    if (!checkInDialog?.open) checkInDialog?.showModal();
    checkInDialog?.querySelector<HTMLInputElement>('input[name="firstName"]')?.focus({ preventScroll: true });
  });
  screenRoot.querySelector<HTMLButtonElement>("#close-checkin-dialog")?.addEventListener("click", () => checkInDialog?.close());
  checkInDialog?.addEventListener("click", (event) => {
    if (event.target === checkInDialog) checkInDialog.close();
  });
  screenRoot.querySelector<HTMLFormElement>("#checkin-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Saving check-in…"; }
    const data = new FormData(form);
    try {
      const result = await api<{ queueEntry: QueueEntry }>("/api/patients/check-in", jsonBody({
        firstName: data.get("firstName"), lastName: data.get("lastName"), identifier: data.get("identifier"),
        phone: data.get("phone"), dateOfBirth: data.get("dateOfBirth"), reason: data.get("reason"), priority: data.get("priority"),
      }));
      queuePageOffsets.set("reception", 0);
      await refreshCurrent();
      showToast(`Patient checked in · ticket ${result.queueEntry.ticketNumber}`);
    } catch (error) {
      if (button) { button.disabled = false; button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">confirmation_number</span> Check in patient`; }
      showToast(error instanceof Error ? error.message : "Check-in could not be saved.", "error");
    }
  });
  const slaForm = screenRoot.querySelector<HTMLFormElement>("#sla-form");
  const updateSlaStepButtons = (input: HTMLInputElement): void => {
    const control = input.closest<HTMLElement>(".number-control");
    if (!control) return;
    const value = input.value.trim() === "" ? null : Number(input.value);
    const minimum = Number(input.min) || 1;
    const maximum = Number(input.max) || 240;
    for (const stepper of control.querySelectorAll<HTMLButtonElement>("[data-sla-step]")) {
      const direction = Number(stepper.dataset.slaStep);
      stepper.disabled = input.disabled || (direction < 0 ? value === null || value <= minimum : value !== null && value >= maximum);
    }
  };
  slaForm?.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name in departmentLabels) updateSlaStepButtons(event.target);
  });
  slaForm?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const stepper = event.target.closest<HTMLButtonElement>("[data-sla-step]");
    if (!stepper) return;
    const input = stepper.closest<HTMLElement>(".number-control")?.querySelector<HTMLInputElement>("input[type=number]");
    if (!input || input.disabled) return;
    const direction = Number(stepper.dataset.slaStep);
    const currentValue = input.value.trim() === "" ? null : Number(input.value);
    if (currentValue === null && direction < 0) return;
    const minimum = Number(input.min) || 1;
    const maximum = Number(input.max) || 240;
    const nextValue = currentValue === null ? minimum : Math.min(maximum, Math.max(minimum, currentValue + direction));
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  slaForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values: Partial<Record<Department, number>> = {};
    for (const department of departmentOrder) {
      const raw = String(new FormData(form).get(department) ?? "").trim();
      if (raw) values[department] = Number(raw);
    }
    try {
      await api("/api/facility/settings", { method: "PATCH", body: JSON.stringify({ departmentSlaMinutes: values }) });
      showToast("Service targets saved.");
      await refreshCurrent();
    } catch (error) { showToast(error instanceof Error ? error.message : "Settings could not be saved.", "error"); }
  });
  const facilitySettingsForm = screenRoot.querySelector<HTMLFormElement>("#facility-settings-form");
  facilitySettingsForm?.querySelector<HTMLInputElement>('input[name="publicDisplayEnabled"]')?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const stateLabel = input.closest<HTMLElement>(".switch-wrap")?.querySelector<HTMLElement>("span:last-child");
    if (stateLabel) stateLabel.textContent = input.checked ? "Enabled" : "Disabled";
  });
  facilitySettingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const enabled = form.querySelector<HTMLInputElement>('input[name="publicDisplayEnabled"]')?.checked ?? false;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Saving preferences…"; }
    try {
      await api("/api/facility/settings", { method: "PATCH", body: JSON.stringify({ timezone: data.get("timezone"), publicDisplayEnabled: enabled }) });
      showToast("Facility preferences saved.");
      await refreshCurrent();
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = "Save preferences"; }
      showToast(error instanceof Error ? error.message : "Settings could not be saved.", "error");
    }
  });
  const displayContentForm = screenRoot.querySelector<HTMLFormElement>("#admin-display-content-form");
  displayContentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const displayContent: PublicDisplayContent = {};
    for (const slug of publicDisplaySlugs) {
      displayContent[slug] = {
        eyebrow: String(data.get(`${slug}.eyebrow`) ?? ""),
        headline: String(data.get(`${slug}.headline`) ?? ""),
        body: String(data.get(`${slug}.body`) ?? ""),
      };
    }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Saving display content…"; }
    try {
      await api("/api/facility/settings", { method: "PATCH", body: JSON.stringify({ publicDisplayContent: displayContent }) });
      showToast("Public display content saved.");
      await refreshCurrent();
    } catch (error) {
      if (button) { button.disabled = false; button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">save</span> Save display messages`; }
      showToast(error instanceof Error ? error.message : "Display content could not be saved.", "error");
    }
  });
  screenRoot.querySelector<HTMLFormElement>("#invite-code-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const role = String(new FormData(form).get("accountRole")) as InvitableRole;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Creating invite…"; }
    try {
      const result = await api<{ inviteCode: string; accountRole: InvitableRole }>("/api/facility/invite-codes", jsonBody({ accountRole: role }));
      showInviteCodeDialog(result.inviteCode, ACCOUNT_ROLE_DEFINITIONS[result.accountRole].label);
      await refreshCurrent();
    } catch (error) {
      if (button) { button.disabled = false; button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">add_link</span>Create role invite`; }
      showToast(error instanceof Error ? error.message : "A role invite could not be created.", "error");
    }
  });
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-revoke-invite]")) {
    button.addEventListener("click", async () => {
      const inviteId = button.dataset.revokeInvite;
      if (!inviteId) return;
      button.disabled = true;
      try {
        await api(`/api/facility/invite-codes/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
        showToast("Invite code revoked. It can no longer be used to join.");
        await refreshCurrent();
      } catch (error) {
        button.disabled = false;
        showToast(error instanceof Error ? error.message : "The invite code could not be revoked.", "error");
      }
    });
  }
  for (const select of screenRoot.querySelectorAll<HTMLSelectElement>("[data-member-role]")) {
    select.addEventListener("change", () => {
      const id = select.dataset.memberRole;
      if (!id) return;
      const saveButton = screenRoot.querySelector<HTMLButtonElement>(`[data-save-member-role="${CSS.escape(id)}"]`);
      if (saveButton) saveButton.disabled = select.value === select.dataset.originalRole;
    });
  }
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-save-member-role]")) {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveMemberRole;
      const select = screenRoot.querySelector<HTMLSelectElement>(`[data-member-role="${CSS.escape(id ?? "")}"]`);
      if (!id || !select || !ROLE_ASSIGNMENT_ROLES.includes(select.value as AssignableRole)) return;
      button.disabled = true;
      try {
        const result = await api<{ changed: boolean; clearedAssignments?: number }>(`/api/staff/${encodeURIComponent(id)}/role`, { method: "PATCH", body: JSON.stringify({ accountRole: select.value }) });
        showToast(result.changed ? `Role updated. The team member must sign in again.${result.clearedAssignments ? ` ${result.clearedAssignments} active queue assignment${result.clearedAssignments === 1 ? " was" : "s were"} cleared.` : ""}` : "No role change was needed.");
        await refreshCurrent();
      } catch (error) {
        button.disabled = false;
        showToast(error instanceof Error ? error.message : "The team member’s role could not be updated.", "error");
      }
    });
  }
  for (const button of screenRoot.querySelectorAll<HTMLButtonElement>("[data-queue-action]")) {
    button.addEventListener("click", async () => {
      const id = button.dataset.entryId;
      const action = button.dataset.queueAction;
      if (!id || !action) return;
      const body: Record<string, string> = { action };
      if (action === "advance") {
        const select = screenRoot.querySelector<HTMLSelectElement>(`[data-next-department="${CSS.escape(id)}"]`);
        const nextDepartment = select?.value || button.dataset.nextDepartment;
        if (!nextDepartment) { showToast("Choose the next department first.", "error"); return; }
        body.nextDepartment = nextDepartment;
      }
      button.disabled = true;
      try {
        await api(`/api/queue/${encodeURIComponent(id)}/action`, jsonBody(body));
        await refreshCurrent();
        showToast(action === "advance" ? "Patient moved to the selected department." : `Queue updated: ${action.replaceAll("_", " ")}.`);
      } catch (error) { button.disabled = false; showToast(error instanceof Error ? error.message : "Queue could not be updated.", "error"); }
    });
  }
  for (const select of screenRoot.querySelectorAll<HTMLSelectElement>("[data-assign-entry]")) {
    select.addEventListener("change", async () => {
      const id = select.dataset.assignEntry;
      if (!id) return;
      select.disabled = true;
      try {
        await api(`/api/queue/${encodeURIComponent(id)}/assign`, jsonBody({ userId: select.value || null }));
        await refreshCurrent();
        showToast(select.value ? "Queue entry assigned." : "Queue entry unassigned.");
      } catch (error) { select.disabled = false; showToast(error instanceof Error ? error.message : "Assignment could not be saved.", "error"); }
    });
  }
}

function rememberIntendedScreen(slug: ScreenSlug): void {
  try { sessionStorage.setItem(intendedScreenKey, slug); } catch { /* Deep-link restoration is optional. */ }
}

function clearLegacyPreviewData(): void {
  try { for (const key of ["mums-care-demo-accounts", "mums-care-preview-remembered-session"]) localStorage.removeItem(key); } catch { /* Server sessions remain authoritative. */ }
  try { sessionStorage.removeItem("mums-care-preview-session"); } catch { /* Server sessions remain authoritative. */ }
}

function showInviteCodeDialog(code: string, roleLabel = "Role assignment needed"): void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.documentElement.style.overflow;
  const dialog = document.createElement("div");
  dialog.className = "invite-dialog-backdrop";
  dialog.setAttribute("role", "presentation");
  dialog.innerHTML = `<section class="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title" aria-describedby="invite-dialog-desc"><span class="material-symbols-outlined invite-dialog-icon" aria-hidden="true">key</span><span class="page-kicker"><span></span> FACILITY SET UP</span><h2 id="invite-dialog-title">${escapeHtml(roleLabel)} invitation</h2><p id="invite-dialog-desc">Anyone who joins with this code receives this role. The code is shown once. Store it securely and share it only with the intended team member${roleLabel === "Role assignment needed" ? "; this account will not see patient information until an administrator assigns a role" : "s"}.</p><code>${escapeHtml(code)}</code><div class="invite-dialog-actions"><button class="button button-secondary" type="button" data-invite-close>Close</button><button class="button button-primary" type="button" data-invite-copy>Copy invite code</button></div></section>`;
  const close = (): void => {
    if (!dialog.isConnected) return;
    document.removeEventListener("keydown", onKeydown);
    document.documentElement.style.overflow = previousOverflow;
    dialog.remove();
    previousFocus?.focus();
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));
    if (!buttons.length) return;
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.documentElement.style.overflow = "hidden";
  document.addEventListener("keydown", onKeydown);
  document.body.append(dialog);
  dialog.querySelector<HTMLButtonElement>("[data-invite-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Copied";
      showToast("Invite code copied. Store it securely.");
      window.setTimeout(() => { if (button.isConnected) button.textContent = "Copy invite code"; }, 1800);
    } catch { showToast("Select and copy the invite code from the dialog.", "error"); }
  });
  dialog.querySelector<HTMLButtonElement>("[data-invite-close]")?.addEventListener("click", close);
  window.setTimeout(() => dialog.querySelector<HTMLButtonElement>("[data-invite-close]")?.focus(), 60);
}

function takeIntendedScreen(): ScreenSlug | null {
  try {
    const value = sessionStorage.getItem(intendedScreenKey);
    sessionStorage.removeItem(intendedScreenKey);
    return isScreenSlug(value) ? value : null;
  } catch { return null; }
}

async function renderCurrentPage(historyMode: "push" | "replace" | "none" = "none"): Promise<void> {
  const url = new URL(location.href);
  const requestedScreen = url.searchParams.get("screen");
  const requested = isScreenSlug(requestedScreen) ? requestedScreen : url.searchParams.get("view") === "admin" ? "admin-panel" : null;
  const mode = authModeFromUrl();
  if (!currentUser && requested) {
    rememberIntendedScreen(requested);
    url.searchParams.delete("screen");
    url.searchParams.delete("view");
    url.searchParams.set("auth", "login");
    history.replaceState({ auth: "login" }, "", url);
  }
  if (mode || !currentUser) {
    const authMode = mode ?? "login";
    window.clearInterval(liveRefreshTimer);
    liveRefreshTimer = 0;
    workspaceShell.hidden = true;
    authRoot.hidden = false;
    document.documentElement.classList.add("auth-active");
    document.body.classList.add("auth-active");
    document.title = authMode === "login" ? "Sign in · Mum’s Care" : "Create account · Mum’s Care";
    mountAuth(authRoot, authMode, (result: AuthenticatedResult) => {
      currentUser = result.user;
      setUserChrome(result.user);
      const intendedScreen = takeIntendedScreen() ?? defaultScreenForRole(result.user.accountRole);
      const nextUrl = new URL(location.href);
      nextUrl.searchParams.delete("auth");
      nextUrl.searchParams.set("screen", intendedScreen);
      history.pushState({ screen: intendedScreen }, "", nextUrl);
      void showScreen(intendedScreen, "none");
      if (result.inviteCode) {
        const roleLabel = result.inviteCodeRole ? ACCOUNT_ROLE_DEFINITIONS[result.inviteCodeRole].label : "Role assignment needed";
        showInviteCodeDialog(result.inviteCode, roleLabel);
      }
    });
    return;
  }
  authRoot.hidden = true;
  workspaceShell.hidden = false;
  document.documentElement.classList.remove("auth-active");
  document.body.classList.remove("auth-active");
  const slug = requested ?? defaultScreenForRole(currentUser.accountRole);
  await showScreen(slug, historyMode);
}

async function bootstrap(): Promise<void> {
  clearLegacyPreviewData();
  populateWorkspaceNavigation();
  applyTheme(activeTheme);
  applySidebarState(sidebarCollapsed);
  sidebarToggle.addEventListener("click", () => applySidebarState(!sidebarCollapsed));
  workspaceShell.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[data-screen]");
    if (!link) return;
    if (event instanceof MouseEvent && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    const slug = link.dataset.screen;
    if (!slug || !isScreenSlug(slug)) return;
    event.preventDefault();
    void showScreen(slug);
  });
  themeToggle.addEventListener("click", () => applyTheme(activeTheme === "dark" ? "light" : "dark"));
  logoutButton.addEventListener("click", async () => {
    window.clearInterval(liveRefreshTimer);
    liveRefreshTimer = 0;
    try { await api<void>("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* Clear local route even if session already expired. */ }
    currentUser = null;
    const url = new URL(location.href);
    url.searchParams.delete("screen");
    url.searchParams.set("auth", "login");
    history.pushState({ auth: "login" }, "", url);
    await renderCurrentPage("none");
  });
  window.addEventListener("popstate", () => { void renderCurrentPage("none"); });
  try {
    const session = await api<{ authenticated: boolean; user: AuthUser | null }>("/api/auth/session");
    currentUser = session.authenticated ? session.user : null;
  } catch { currentUser = null; }
  if (currentUser) setUserChrome(currentUser);
  await renderCurrentPage("replace");
  appBoot?.classList.add("is-hidden");
  window.setTimeout(() => appBoot?.remove(), 280);
}

void bootstrap();
