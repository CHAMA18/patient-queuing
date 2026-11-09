import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { PoolClient, QueryResult } from "pg";
import { z } from "zod";
import { pool } from "./db.js";
import { runMigrations } from "./migrations.js";
import { DEPARTMENTS, DEPARTMENT_HANDOFFS, INVITABLE_ROLES, ROLE_ASSIGNMENT_ROLES, VISIT_COMPLETION_DEPARTMENTS, departmentForRole, type AccountRole, type Department } from "../roles.js";

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const API_HOST = process.env.API_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const SESSION_COOKIE = "mums_care_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_DEFAULT_LIFETIME_MS = 8 * 60 * 60 * 1000;
const app = express();
const departments = DEPARTMENTS;
type QueueStatus = "waiting" | "called" | "in_progress" | "completed" | "cancelled";

interface AuthenticatedUser {
  id: string;
  facilityId: string;
  facilityName: string;
  fullName: string;
  email: string;
  jobTitle: string;
  accountRole: AccountRole;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const asyncRoute = (handler: AsyncHandler): RequestHandler => (req, res, next) => {
  void handler(req, res, next).catch(next);
};

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many sign-in attempts. Please wait and try again." } },
});

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://api.fontshare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdn.fontshare.com", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use(express.json({ limit: "128kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
  rememberMe: z.boolean().default(false),
  accountType: z.enum(["admin", "staff"]).optional(),
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  facilityName: z.string().trim().max(160).optional().default(""),
  inviteCode: z.string().trim().max(160).optional().default(""),
  jobTitle: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(256).regex(/(?=.*[0-9])/, "Password must contain a number."),
  accountType: z.enum(["admin", "staff"]).optional(),
});

const checkInSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  identifier: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  dateOfBirth: z.string().trim().optional().default(""),
  reason: z.string().trim().min(2).max(240),
  priority: z.enum(["standard", "priority", "urgent"]).default("standard"),
});

const transitionSchema = z.object({
  action: z.enum(["call", "start", "advance", "complete", "cancel"]),
  nextDepartment: z.enum(departments).optional(),
});

const assignSchema = z.object({ userId: z.string().uuid().nullable() });
const inviteRoleSchema = z.object({ accountRole: z.enum(INVITABLE_ROLES) }).strict();
const roleAssignmentSchema = z.object({ accountRole: z.enum(ROLE_ASSIGNMENT_ROLES) }).strict();
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const publicDisplayCopySchema = z.object({
  eyebrow: z.string().trim().min(1).max(60),
  headline: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(300),
}).strict();
const publicDisplayContentSchema = z.object({
  "audio-announcement-broadcast-tv-display": publicDisplayCopySchema,
  "vitals-waiting-area-tv-display": publicDisplayCopySchema,
  "main-waiting-area-tv-display": publicDisplayCopySchema,
}).partial().strict();
const displayMediaUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}, "Use a secure image URL or a path within this facility workspace.");
const displayContentIdSchema = z.string().trim().min(1).max(80);
const patientDisplayLibrarySchema = z.object({
  adverts: z.array(z.object({
    id: displayContentIdSchema,
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(240),
    category: z.string().trim().max(60),
    imageUrl: displayMediaUrlSchema,
    enabled: z.boolean(),
  }).strict()).max(20),
  services: z.array(z.object({
    id: displayContentIdSchema,
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(240),
    icon: z.string().trim().min(1).max(50),
    enabled: z.boolean(),
  }).strict()).max(30),
  teamMembers: z.array(z.object({
    id: displayContentIdSchema,
    name: z.string().trim().min(1).max(100),
    role: z.string().trim().min(1).max(100),
    department: z.string().trim().max(80),
    photoUrl: displayMediaUrlSchema,
    enabled: z.boolean(),
  }).strict()).max(30),
  announcements: z.array(z.object({
    id: displayContentIdSchema,
    body: z.string().trim().min(1).max(240),
    enabled: z.boolean(),
  }).strict()).max(30),
}).strict();
const settingsSchema = z.object({
  departmentSlaMinutes: z.partialRecord(z.enum(departments), z.number().int().min(1).max(240)).optional(),
  publicDisplayEnabled: z.boolean().optional(),
  publicDisplayContent: publicDisplayContentSchema.optional(),
  patientDisplayLibrary: patientDisplayLibrarySchema.optional(),
  timezone: z.string().trim().min(1).max(64).refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA timezone.").optional(),
}).strict();

const scrypt = promisify(scryptCallback) as (password: string, salt: string, keyLength: number) => Promise<Buffer>;
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const normalizeFacilityName = (name: string): string => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, digestHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !digestHex) return false;
  const expected = Buffer.from(digestHex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function setSessionCookie(res: Response, token: string, maxAge: number): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function cookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const piece of cookieHeader.split(";")) {
    const [key, ...value] = piece.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

const loadSession: RequestHandler = asyncRoute(async (req, _res, next) => {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return next();

  const result = await pool.query<AuthenticatedUser>(
    `SELECT u.id, u.facility_id AS "facilityId", f.name AS "facilityName",
            u.full_name AS "fullName", u.email, u.job_title AS "jobTitle", u.account_role AS "accountRole"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN facilities f ON f.id = u.facility_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`,
    [sha256(token)],
  );
  req.authUser = result.rows[0];
  next();
});

const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.authUser) {
    res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Sign in to continue." } });
    return;
  }
  next();
};

function requireRoles(roles: readonly AccountRole[], code = "ROLE_REQUIRED", message = "Your account does not have permission to perform this action."): RequestHandler {
  return (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Sign in to continue." } });
      return;
    }
    if (!roles.includes(req.authUser.accountRole)) {
      res.status(403).json({ error: { code, message } });
      return;
    }
    next();
  };
}

const requireAdmin = requireRoles(["admin"], "ADMIN_REQUIRED", "A facility administrator must perform this action.");

function requireDepartmentAccess(user: AuthenticatedUser, department: Department): void {
  if (user.accountRole !== "admin" && departmentForRole(user.accountRole) !== department) {
    throw new ApiError(403, "DEPARTMENT_ACCESS_REQUIRED", "Your role cannot access this service area.");
  }
}

function currentUser(req: Request): AuthenticatedUser {
  if (!req.authUser) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
  return req.authUser;
}

async function writeQueueEvent(
  client: PoolClient,
  input: {
    facilityId: string;
    queueEntryId: string;
    actorUserId: string;
    action: string;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO queue_events
       (id, facility_id, queue_entry_id, actor_user_id, action, from_department, to_department, from_status, to_status, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(), input.facilityId, input.queueEntryId, input.actorUserId, input.action,
      input.fromDepartment ?? null, input.toDepartment ?? null, input.fromStatus ?? null,
      input.toStatus ?? null, JSON.stringify(input.details ?? {})],
  );
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ApiError(400, "VALIDATION_ERROR", `${field}${issue?.message ?? "Check the submitted details."}`);
  }
  return parsed.data;
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  const result = await pool.query<{ version: string; database: string }>(
    "SELECT version(), current_database() AS database",
  );
  res.json({ status: "ok", database: result.rows[0]?.database, postgres: result.rows[0]?.version });
}));

app.post("/api/auth/register", loginLimit, asyncRoute(async (req, res) => {
  const input = parseBody(registerSchema, req.body);
  const email = input.email.toLocaleLowerCase("en");
  const facilityName = input.facilityName.trim().replace(/\s+/g, " ");
  const normalizedName = facilityName ? normalizeFacilityName(facilityName) : "";
  if (!input.inviteCode && input.accountType === "staff") {
    throw new ApiError(403, "INVITE_CODE_REQUIRED", "Staff accounts join an existing team. Enter your team invite code, or register as Admin to create a facility.");
  }
  if (!input.inviteCode && facilityName.length < 2) {
    throw new ApiError(400, "FACILITY_NAME_REQUIRED", "Enter a facility name to create a new workspace, or use an invite code to join an existing team.");
  }
  const client = await pool.connect();
  let accountRole: AccountRole = "pending_assignment";
  let inviteCodeForOwner: string | undefined;
  const userId = randomUUID();

  try {
    await client.query("BEGIN");
    let facility: QueryResult<{ id: string; invite_code_hash: string }>;
    if (input.inviteCode) {
      const invitation = await client.query<{ facilityId: string; accountRole: AccountRole }>(
        `SELECT facility_id AS "facilityId", account_role AS "accountRole"
           FROM facility_invite_codes
          WHERE code_hash = $1 AND revoked_at IS NULL
          FOR UPDATE`,
        [sha256(input.inviteCode)],
      );
      if (!invitation.rowCount) {
        throw new ApiError(403, "INVITE_CODE_REQUIRED", "Ask your facility administrator for a valid team invite code.");
      }
      accountRole = invitation.rows[0]!.accountRole;
      if (input.accountType) {
        const inviteIsAdmin = accountRole === "admin";
        if ((input.accountType === "admin") !== inviteIsAdmin) {
          const expected = inviteIsAdmin ? "Admin" : "Staff";
          throw new ApiError(403, "ACCOUNT_TYPE_MISMATCH", `That invite code joins the ${expected} workspace. Switch to ${expected} to continue.`);
        }
      }
      facility = await client.query<{ id: string; invite_code_hash: string }>(
        "SELECT id, invite_code_hash FROM facilities WHERE id = $1",
        [invitation.rows[0]!.facilityId],
      );
    } else {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [normalizedName]);
      facility = await client.query<{ id: string; invite_code_hash: string }>(
        "SELECT id, invite_code_hash FROM facilities WHERE normalized_name = $1 FOR UPDATE",
        [normalizedName],
      );
      if (facility.rowCount) {
        throw new ApiError(403, "INVITE_CODE_REQUIRED", "Ask your facility administrator for a valid team invite code.");
      }
      inviteCodeForOwner = randomBytes(24).toString("base64url");
      const facilityId = randomUUID();
      facility = await client.query<{ id: string; invite_code_hash: string }>(
        `INSERT INTO facilities (id, name, normalized_name, invite_code_hash)
         VALUES ($1,$2,$3,$4) RETURNING id, invite_code_hash`,
        [facilityId, facilityName, normalizedName, sha256(inviteCodeForOwner)],
      );
      accountRole = "admin";
    }

    const passwordHash = await hashPassword(input.password);
    await client.query(
      `INSERT INTO users (id, facility_id, full_name, email, password_hash, job_title, account_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, facility.rows[0]!.id, input.fullName, email, passwordHash, input.jobTitle, accountRole],
    );
    if (inviteCodeForOwner) {
      await client.query(
        `INSERT INTO facility_invite_codes (id, facility_id, code_hash, account_role, created_by_user_id)
         VALUES ($1,$2,$3,'pending_assignment',$4)`,
        [randomUUID(), facility.rows[0]!.id, sha256(inviteCodeForOwner), userId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) throw new ApiError(409, "EMAIL_EXISTS", "An account with this email already exists.");
    throw error;
  } finally {
    client.release();
  }

  await createSession(userId, res);
  const user = await getUserById(userId);
  res.status(201).json({ user, inviteCode: inviteCodeForOwner, inviteCodeRole: inviteCodeForOwner ? "pending_assignment" : undefined });
}));

app.post("/api/auth/login", loginLimit, asyncRoute(async (req, res) => {
  const input = parseBody(signInSchema, req.body);
  const result = await pool.query<{ id: string; password_hash: string; disabled_at: Date | null; account_role: AccountRole }>(
    "SELECT id, password_hash, disabled_at, account_role FROM users WHERE lower(email) = $1",
    [input.email.toLocaleLowerCase("en")],
  );
  const account = result.rows[0];
  if (!account || account.disabled_at || !(await verifyPassword(input.password, account.password_hash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  if (input.accountType && (input.accountType === "admin") !== (account.account_role === "admin")) {
    const expectedType = account.account_role === "admin" ? "Admin" : "Staff";
    throw new ApiError(403, "ACCOUNT_TYPE_MISMATCH", `This account is set up for the ${expectedType} workspace. Switch to ${expectedType} to sign in.`);
  }

  await createSession(account.id, res, input.rememberMe);
  res.json({ user: await getUserById(account.id) });
}));

app.get("/api/auth/session", loadSession, (req, res) => {
  if (!req.authUser) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const { id, facilityId, facilityName, fullName, email, jobTitle, accountRole } = req.authUser;
  res.json({ authenticated: true, user: { id, facilityId, facilityName, fullName, email, jobTitle, accountRole } });
});

app.post("/api/auth/logout", loadSession, asyncRoute(async (req, res) => {
  const token = cookieValue(req, SESSION_COOKIE);
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  clearSessionCookie(res);
  res.status(204).end();
}));

app.use("/api", loadSession);

app.get("/api/facility", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const result = await pool.query(
    `SELECT f.id, f.name, f.timezone, f.settings, f.created_at AS "createdAt",
            (SELECT count(*)::int FROM users u WHERE u.facility_id = f.id AND u.disabled_at IS NULL) AS "staffCount"
       FROM facilities f WHERE f.id = $1`,
    [user.facilityId],
  );
  res.json({ facility: result.rows[0], accountRole: user.accountRole });
}));

app.get("/api/facility/invite-codes", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const result = await pool.query(
    `SELECT i.id, i.account_role AS "accountRole", i.created_at AS "createdAt",
            u.full_name AS "createdByName"
       FROM facility_invite_codes i
       LEFT JOIN users u ON u.id = i.created_by_user_id
      WHERE i.facility_id = $1 AND i.revoked_at IS NULL
      ORDER BY i.created_at DESC`,
    [user.facilityId],
  );
  res.json({ inviteCodes: result.rows });
}));

app.post("/api/facility/invite-codes", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(inviteRoleSchema, req.body);
  const code = randomBytes(24).toString("base64url");
  await pool.query(
    `INSERT INTO facility_invite_codes (id, facility_id, code_hash, account_role, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), user.facilityId, sha256(code), input.accountRole, user.id],
  );
  res.status(201).json({ inviteCode: code, accountRole: input.accountRole });
}));

app.delete("/api/facility/invite-codes/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const id = singleRouteParam(req.params.id);
  const result = await pool.query(
    `UPDATE facility_invite_codes SET revoked_at = now()
      WHERE id = $1 AND facility_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [id, user.facilityId],
  );
  if (!result.rowCount) throw new ApiError(404, "INVITE_CODE_NOT_FOUND", "The active invite code was not found.");
  res.json({ revoked: true });
}));

app.patch("/api/facility/settings", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(settingsSchema, req.body);
  const current = await pool.query<{ settings: Record<string, unknown>; timezone: string }>(
    "SELECT settings, timezone FROM facilities WHERE id = $1",
    [user.facilityId],
  );
  const settings = { ...current.rows[0]!.settings };
  if (input.departmentSlaMinutes) settings.departmentSlaMinutes = input.departmentSlaMinutes;
  if (input.publicDisplayEnabled !== undefined) settings.publicDisplayEnabled = input.publicDisplayEnabled;
  if (input.publicDisplayContent) {
    const currentDisplayContent = settings.publicDisplayContent && typeof settings.publicDisplayContent === "object" && !Array.isArray(settings.publicDisplayContent)
      ? settings.publicDisplayContent as Record<string, unknown>
      : {};
    settings.publicDisplayContent = { ...currentDisplayContent, ...input.publicDisplayContent };
  }
  if (input.patientDisplayLibrary) settings.patientDisplayLibrary = input.patientDisplayLibrary;
  const timezone = input.timezone ?? current.rows[0]!.timezone;
  const result = await pool.query(
    "UPDATE facilities SET settings = $1, timezone = $2 WHERE id = $3 RETURNING id, name, timezone, settings",
    [JSON.stringify(settings), timezone, user.facilityId],
  );
  res.json({ facility: result.rows[0] });
}));

app.get("/api/staff", requireAuth, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  if (user.accountRole !== "admin" && !departmentForRole(user.accountRole)) {
    throw new ApiError(403, "STAFF_ACCESS_REQUIRED", "Your role cannot access team records.");
  }
  const result = await pool.query(
    `SELECT id, full_name AS "fullName", job_title AS "jobTitle", account_role AS "accountRole"
       FROM users
      WHERE facility_id = $1 AND disabled_at IS NULL
        AND ($2::text IS NULL OR account_role = $2)
      ORDER BY full_name`,
    [user.facilityId, user.accountRole === "admin" ? null : user.accountRole],
  );
  res.json({ staff: result.rows });
}));

app.patch("/api/staff/:id/role", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const targetId = singleRouteParam(req.params.id);
  const input = parseBody(roleAssignmentSchema, req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM facilities WHERE id = $1 FOR UPDATE", [user.facilityId]);
    const target = await client.query<{ accountRole: AccountRole }>(
      `SELECT account_role AS "accountRole" FROM users
        WHERE id = $1 AND facility_id = $2 AND disabled_at IS NULL FOR UPDATE`,
      [targetId, user.facilityId],
    );
    if (!target.rowCount) throw new ApiError(404, "STAFF_NOT_FOUND", "The active team member was not found.");
    if (target.rows[0]!.accountRole === input.accountRole) {
      await client.query("COMMIT");
      res.json({ accountRole: input.accountRole, changed: false });
      return;
    }
    if (targetId === user.id) {
      throw new ApiError(400, "SELF_ROLE_CHANGE_NOT_ALLOWED", "Ask another facility administrator to change your role.");
    }
    if (target.rows[0]!.accountRole === "admin" && input.accountRole !== "admin") {
      const admins = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE facility_id = $1 AND account_role = 'admin' AND disabled_at IS NULL",
        [user.facilityId],
      );
      if (Number(admins.rows[0]?.count ?? 0) <= 1) {
        throw new ApiError(409, "LAST_ADMIN_REQUIRED", "A facility must keep at least one active administrator.");
      }
    }
    const clearedAssignments = await client.query<{ id: string; department: Department }>(
      `UPDATE queue_entries SET assigned_user_id = NULL, updated_at = now()
        WHERE assigned_user_id = $1 AND facility_id = $2
          AND status IN ('waiting','called','in_progress')
        RETURNING id, department`,
      [targetId, user.facilityId],
    );
    for (const entry of clearedAssignments.rows) {
      await writeQueueEvent(client, {
        facilityId: user.facilityId,
        queueEntryId: entry.id,
        actorUserId: user.id,
        action: "unassigned",
        fromDepartment: entry.department,
        toDepartment: entry.department,
        details: { previousAssignedUserId: targetId, reason: "team_role_changed" },
      });
    }
    await client.query("UPDATE users SET account_role = $1 WHERE id = $2 AND facility_id = $3", [input.accountRole, targetId, user.facilityId]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [targetId]);
    await client.query("COMMIT");
    res.json({ accountRole: input.accountRole, changed: true, sessionsRevoked: true, clearedAssignments: clearedAssignments.rowCount ?? 0 });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/dashboard", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const stats = await pool.query(
    `SELECT
       count(*) FILTER (WHERE checked_in_at >= date_trunc('day', now() AT TIME ZONE f.timezone) AT TIME ZONE f.timezone)::int AS "checkedInToday",
       count(*) FILTER (WHERE status = 'waiting')::int AS waiting,
       count(*) FILTER (WHERE status = 'called')::int AS called,
       count(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
       count(*) FILTER (WHERE status = 'completed' AND completed_at >= date_trunc('day', now() AT TIME ZONE f.timezone) AT TIME ZONE f.timezone)::int AS "completedToday",
       coalesce(round(avg(extract(epoch FROM (coalesce(called_at, now()) - checked_in_at)) / 60)
         FILTER (WHERE status IN ('waiting','called','in_progress')))::int, 0) AS "averageWaitMinutes"
     FROM queue_entries q JOIN facilities f ON f.id = q.facility_id
     WHERE q.facility_id = $1`,
    [user.facilityId],
  );
  const departmentStats = await pool.query(
    `SELECT department, count(*) FILTER (WHERE status IN ('waiting','called','in_progress'))::int AS active,
            count(*) FILTER (WHERE status = 'waiting')::int AS waiting,
            count(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress"
       FROM queue_entries WHERE facility_id = $1 GROUP BY department ORDER BY department`,
    [user.facilityId],
  );
  const departmentPerformance = await pool.query<{
    department: Department;
    servedToday: number;
    averageWaitMinutes: number | null;
    averageServiceMinutes: number | null;
  }>(
    `WITH facility_day AS (
       SELECT date_trunc('day', now() AT TIME ZONE timezone) AT TIME ZONE timezone AS starts_at
         FROM facilities WHERE id = $1
     ), stage_calls AS (
       SELECT e.queue_entry_id, e.from_department AS department, e.created_at AS called_at,
              (SELECT max(arrival.created_at)
                 FROM queue_events arrival
                WHERE arrival.queue_entry_id = e.queue_entry_id
                  AND arrival.action IN ('checked_in','advance')
                  AND arrival.to_department = e.from_department
                  AND arrival.created_at <= e.created_at) AS arrived_at
         FROM queue_events e CROSS JOIN facility_day d
        WHERE e.facility_id = $1 AND e.action = 'call' AND e.created_at >= d.starts_at
     ), stage_finishes AS (
       SELECT e.queue_entry_id, e.from_department AS department, e.created_at AS finished_at,
              (SELECT max(started.created_at)
                 FROM queue_events started
                WHERE started.queue_entry_id = e.queue_entry_id
                  AND started.action = 'start'
                  AND started.from_department = e.from_department
                  AND started.created_at <= e.created_at) AS service_started_at
         FROM queue_events e CROSS JOIN facility_day d
        WHERE e.facility_id = $1 AND e.action IN ('advance','complete')
          AND e.from_department IS NOT NULL AND e.created_at >= d.starts_at
     ), waiting_times AS (
       SELECT department,
              round(avg(extract(epoch FROM (called_at - arrived_at)) / 60))::int AS "averageWaitMinutes"
         FROM stage_calls WHERE arrived_at IS NOT NULL GROUP BY department
     ), service_times AS (
       SELECT department, count(*)::int AS "servedToday",
              round(avg(extract(epoch FROM (finished_at - service_started_at)) / 60)
                FILTER (WHERE service_started_at IS NOT NULL))::int AS "averageServiceMinutes"
         FROM stage_finishes GROUP BY department
     )
     SELECT d.department, coalesce(s."servedToday", 0)::int AS "servedToday",
            w."averageWaitMinutes", s."averageServiceMinutes"
       FROM (SELECT DISTINCT department FROM queue_entries WHERE facility_id = $1) d
       LEFT JOIN waiting_times w ON w.department = d.department
       LEFT JOIN service_times s ON s.department = d.department
      ORDER BY d.department`,
    [user.facilityId],
  );
  const performanceByDepartment = new Map(departmentPerformance.rows.map((row) => [row.department, row]));
  const departments = departmentStats.rows.map((row) => ({ ...row, ...performanceByDepartment.get(row.department) }));
  const recent = await queryQueue(user.facilityId, undefined, ["waiting", "called", "in_progress"], 8);
  res.json({ overview: stats.rows[0], departments, queue: recent });
}));

app.get("/api/queue", requireAuth, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const departmentParam = req.query.department;
  const statusParam = req.query.status;
  let department = departmentParam === undefined ? undefined : parseDepartment(String(departmentParam));
  if (user.accountRole !== "admin") {
    const assignedDepartment = departmentForRole(user.accountRole);
    if (!assignedDepartment) throw new ApiError(403, "QUEUE_ACCESS_REQUIRED", "Your role cannot access patient queues.");
    if (department && department !== assignedDepartment) {
      throw new ApiError(403, "DEPARTMENT_ACCESS_REQUIRED", "Your role cannot access this service area.");
    }
    department = assignedDepartment;
  }
  const statuses: QueueStatus[] = statusParam === undefined || statusParam === "active"
    ? ["waiting", "called", "in_progress"]
    : String(statusParam).split(",").map(parseStatus);
  const requestedLimit = Number(req.query.limit ?? 25);
  const requestedOffset = Number(req.query.offset ?? 0);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || !Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    throw new ApiError(400, "INVALID_QUEUE_PAGE", "Queue page size and offset must be valid whole numbers.");
  }
  const limit = Math.min(requestedLimit, 100);
  const count = await pool.query<{ total: number; waiting: number; called: number; inProgress: number; longestWaitMinutes: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'waiting')::int AS waiting,
            count(*) FILTER (WHERE status = 'called')::int AS called,
            count(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
            coalesce(max(floor(extract(epoch FROM (now() - coalesce(
              (SELECT max(e.created_at) FROM queue_events e
                WHERE e.queue_entry_id = q.id AND e.action IN ('checked_in','advance') AND e.to_department = q.department),
              q.checked_in_at
            ))) / 60)) FILTER (WHERE status = 'waiting'), 0)::int AS "longestWaitMinutes"
       FROM queue_entries q
      WHERE q.facility_id = $1 AND ($2::text IS NULL OR q.department = $2) AND q.status = ANY($3::text[])`,
    [user.facilityId, department ?? null, statuses],
  );
  const total = count.rows[0]?.total ?? 0;
  const lastOffset = total ? Math.floor((total - 1) / limit) * limit : 0;
  const offset = Math.min(requestedOffset, lastOffset);
  const queue = await queryQueue(user.facilityId, department, statuses, limit, undefined, offset);
  res.json({ queue, total, limit, offset, waiting: count.rows[0]?.waiting ?? 0, called: count.rows[0]?.called ?? 0, inProgress: count.rows[0]?.inProgress ?? 0, longestWaitMinutes: count.rows[0]?.longestWaitMinutes ?? 0 });
}));

app.post("/api/patients/check-in", requireAuth, requireRoles(["admin", "receptionist"], "RECEPTION_ACCESS_REQUIRED", "Only reception staff or a facility administrator can register new patients."), asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(checkInSchema, req.body);
  const dateOfBirth = input.dateOfBirth ? validDate(input.dateOfBirth) : null;
  const client = await pool.connect();
  const patientId = randomUUID();
  const queueId = randomUUID();

  try {
    await client.query("BEGIN");
    const nextTicket = await client.query<{ ticket_counter: string }>(
      "UPDATE facilities SET ticket_counter = ticket_counter + 1 WHERE id = $1 RETURNING ticket_counter",
      [user.facilityId],
    );
    if (!nextTicket.rowCount) throw new ApiError(404, "FACILITY_NOT_FOUND", "Facility record was not found.");
    const ticketNumber = `MC-${String(nextTicket.rows[0]!.ticket_counter).padStart(4, "0")}`;
    await client.query(
      `INSERT INTO patients (id, facility_id, first_name, last_name, identifier, phone, date_of_birth, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [patientId, user.facilityId, input.firstName, input.lastName, input.identifier || null, input.phone || null, dateOfBirth, user.id],
    );
    await client.query(
      `INSERT INTO queue_entries (id, facility_id, patient_id, ticket_number, department, status, priority, reason, created_by)
       VALUES ($1,$2,$3,$4,'reception','waiting',$5,$6,$7)`,
      [queueId, user.facilityId, patientId, ticketNumber, input.priority, input.reason, user.id],
    );
    await writeQueueEvent(client, {
      facilityId: user.facilityId, queueEntryId: queueId, actorUserId: user.id,
      action: "checked_in", toDepartment: "reception", toStatus: "waiting",
    });
    await client.query("COMMIT");
    const queue = await queryQueue(user.facilityId, "reception", ["waiting"], 1, queueId);
    res.status(201).json({ queueEntry: queue[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/queue/:id/action", requireAuth, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(transitionSchema, req.body);
  const queueEntryId = singleRouteParam(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      id: string; department: Department; status: QueueStatus; priority: string;
    }>(
      "SELECT id, department, status, priority FROM queue_entries WHERE id = $1 AND facility_id = $2 FOR UPDATE",
      [queueEntryId, user.facilityId],
    );
    const entry = found.rows[0];
    if (!entry) throw new ApiError(404, "QUEUE_ENTRY_NOT_FOUND", "Queue entry was not found.");
    requireDepartmentAccess(user, entry.department);

    let department = entry.department;
    let status: QueueStatus = entry.status;
    let calledAt: Date | null | undefined;
    let startedAt: Date | null | undefined;
    let completedAt: Date | null | undefined;
    switch (input.action) {
      case "call":
        if (status !== "waiting") throw new ApiError(409, "INVALID_QUEUE_ACTION", "Only a waiting patient can be called.");
        status = "called";
        calledAt = new Date();
        break;
      case "start":
        if (status !== "called") throw new ApiError(409, "INVALID_QUEUE_ACTION", "Call the patient before starting the visit.");
        status = "in_progress";
        startedAt = new Date();
        break;
      case "advance":
        if (status !== "in_progress") throw new ApiError(409, "INVALID_QUEUE_ACTION", "Start the current step before moving the patient.");
        if (!input.nextDepartment || input.nextDepartment === department) {
          throw new ApiError(400, "NEXT_DEPARTMENT_REQUIRED", "Choose the next department for this queue entry.");
        }
        if (user.accountRole !== "admin" && !DEPARTMENT_HANDOFFS[department].includes(input.nextDepartment)) {
          throw new ApiError(403, "INVALID_HANDOFF_DIRECTION", "That handoff is not part of the standard patient care pathway.");
        }
        department = input.nextDepartment;
        status = "waiting";
        calledAt = null;
        startedAt = null;
        break;
      case "complete":
        if (status !== "in_progress") throw new ApiError(409, "INVALID_QUEUE_ACTION", "Start the current step before completing it.");
        if (user.accountRole !== "admin" && !VISIT_COMPLETION_DEPARTMENTS.includes(department)) {
          throw new ApiError(403, "VISIT_COMPLETION_NOT_ALLOWED", "Complete the visit after consultation when no further care is needed, or after Pharmacy.");
        }
        status = "completed";
        completedAt = new Date();
        break;
      case "cancel":
        if (status === "completed" || status === "cancelled") throw new ApiError(409, "INVALID_QUEUE_ACTION", "This queue entry is already closed.");
        status = "cancelled";
        completedAt = new Date();
        break;
    }

    await client.query(
      `UPDATE queue_entries SET department = $1, status = $2,
         called_at = CASE WHEN $3::boolean THEN $4::timestamptz ELSE called_at END,
         started_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE started_at END,
         completed_at = CASE WHEN $7::boolean THEN $8::timestamptz ELSE completed_at END,
         updated_at = now()
       WHERE id = $9 AND facility_id = $10`,
      [department, status, calledAt !== undefined, calledAt, startedAt !== undefined, startedAt,
        completedAt !== undefined, completedAt, entry.id, user.facilityId],
    );
    await writeQueueEvent(client, {
      facilityId: user.facilityId, queueEntryId: entry.id, actorUserId: user.id,
      action: input.action, fromDepartment: entry.department, toDepartment: department,
      fromStatus: entry.status, toStatus: status,
    });
    await client.query("COMMIT");
    res.json({ updated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/queue/:id/assign", requireAuth, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(assignSchema, req.body);
  const queueEntryId = singleRouteParam(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const queueEntry = await client.query<{ department: Department }>(
      "SELECT department FROM queue_entries WHERE id = $1 AND facility_id = $2 FOR UPDATE",
      [queueEntryId, user.facilityId],
    );
    if (!queueEntry.rowCount) throw new ApiError(404, "QUEUE_ENTRY_NOT_FOUND", "Queue entry was not found.");
    const department = queueEntry.rows[0]!.department;
    requireDepartmentAccess(user, department);
    if (input.userId) {
      const eligible = await client.query<{ accountRole: AccountRole }>(
        `SELECT account_role AS "accountRole" FROM users
          WHERE id = $1 AND facility_id = $2 AND disabled_at IS NULL`,
        [input.userId, user.facilityId],
      );
      if (!eligible.rowCount) throw new ApiError(400, "STAFF_NOT_FOUND", "Choose an active member of this facility.");
      const assignedRole = eligible.rows[0]!.accountRole;
      if (assignedRole !== "admin" && departmentForRole(assignedRole) !== department) {
        throw new ApiError(400, "STAFF_NOT_ELIGIBLE", "Choose a team member assigned to this service area.");
      }
    }
    const result = await client.query(
      "UPDATE queue_entries SET assigned_user_id = $1, updated_at = now() WHERE id = $2 AND facility_id = $3 RETURNING id",
      [input.userId, queueEntryId, user.facilityId],
    );
    if (!result.rowCount) throw new ApiError(404, "QUEUE_ENTRY_NOT_FOUND", "Queue entry was not found.");
    await writeQueueEvent(client, {
      facilityId: user.facilityId, queueEntryId, actorUserId: user.id,
      action: input.userId ? "assigned" : "unassigned", details: { assignedUserId: input.userId },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.json({ assigned: true });
}));

app.get("/api/messages", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const result = await pool.query(
    `SELECT m.id, m.body, m.created_at AS "createdAt", u.id AS "senderId",
            u.full_name AS "senderName", u.job_title AS "senderTitle"
       FROM messages m JOIN users u ON u.id = m.sender_user_id
      WHERE m.facility_id = $1 ORDER BY m.created_at DESC LIMIT 50`,
    [user.facilityId],
  );
  res.json({ messages: result.rows });
}));

app.post("/api/messages", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(messageSchema, req.body);
  const result = await pool.query(
    `INSERT INTO messages (id, facility_id, sender_user_id, body) VALUES ($1,$2,$3,$4)
     RETURNING id, body, created_at AS "createdAt"`,
    [randomUUID(), user.facilityId, user.id, input.body],
  );
  res.status(201).json({ message: { ...result.rows[0], senderId: user.id, senderName: user.fullName, senderTitle: user.jobTitle } });
}));

app.get("/api/public/queue", asyncRoute(async (req, res) => {
  const facilityId = req.authUser?.facilityId ?? (typeof req.query.facilityId === "string" ? req.query.facilityId : "");
  if (!facilityId) throw new ApiError(401, "AUTH_REQUIRED", "Sign in or provide a facility display identifier.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(facilityId)) {
    throw new ApiError(400, "INVALID_FACILITY", "The facility display identifier is invalid.");
  }
  const facilitySettings = await pool.query<{ settings: Record<string, unknown> }>("SELECT settings FROM facilities WHERE id = $1", [facilityId]);
  if (!facilitySettings.rowCount) throw new ApiError(404, "FACILITY_NOT_FOUND", "Facility was not found.");
  const settings = facilitySettings.rows[0]!.settings;
  const displayLibrary = settings.patientDisplayLibrary && typeof settings.patientDisplayLibrary === "object" && !Array.isArray(settings.patientDisplayLibrary)
    ? settings.patientDisplayLibrary as Record<string, unknown>
    : {};
  const publicDisplayLibrary = Object.fromEntries(["adverts", "services", "teamMembers", "announcements"].map((key) => [
    key,
    Array.isArray(displayLibrary[key])
      ? (displayLibrary[key] as Array<Record<string, unknown>>).filter((item) => item && typeof item === "object" && item.enabled === true)
      : [],
  ]));
  if (settings.publicDisplayEnabled !== true) {
    res.json({ queue: [], counts: [], enabled: false, displayContent: settings.publicDisplayContent ?? {}, patientDisplayLibrary: { adverts: [], services: [], teamMembers: [], announcements: [] } });
    return;
  }
  const department = req.query.department === undefined ? undefined : parseDepartment(String(req.query.department));
  const [activeEntries, waitingEntries, countsResult] = await Promise.all([
    pool.query<{ ticketNumber: string; department: Department; status: QueueStatus; checkedInAt: Date; calledAt: Date | null }>(
      `WITH ranked AS (
         SELECT ticket_number AS "ticketNumber", department, status, checked_in_at AS "checkedInAt", called_at AS "calledAt",
                row_number() OVER (
                  PARTITION BY department
                  ORDER BY CASE WHEN status = 'called' THEN 0 ELSE 1 END,
                           coalesce(called_at, started_at, checked_in_at) DESC
                ) AS position
           FROM queue_entries
          WHERE facility_id = $1 AND ($2::text IS NULL OR department = $2) AND status IN ('called','in_progress')
       ) SELECT "ticketNumber", department, status, "checkedInAt", "calledAt" FROM ranked WHERE position = 1`,
      [facilityId, department ?? null],
    ),
    pool.query<{ ticketNumber: string; department: Department; status: QueueStatus; checkedInAt: Date; calledAt: Date | null }>(
      `WITH ranked AS (
         SELECT ticket_number AS "ticketNumber", department, status, checked_in_at AS "checkedInAt", called_at AS "calledAt",
                row_number() OVER (
                  PARTITION BY department
                  ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, checked_in_at
                ) AS position
           FROM queue_entries
          WHERE facility_id = $1 AND ($2::text IS NULL OR department = $2) AND status = 'waiting'
       ) SELECT "ticketNumber", department, status, "checkedInAt", "calledAt" FROM ranked WHERE position <= 3
          ORDER BY department, position`,
      [facilityId, department ?? null],
    ),
    pool.query<{ department: Department; waiting: number; called: number; inProgress: number }>(
      `SELECT department,
              count(*) FILTER (WHERE status = 'waiting')::int AS waiting,
              count(*) FILTER (WHERE status = 'called')::int AS called,
              count(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress"
         FROM queue_entries
        WHERE facility_id = $1 AND ($2::text IS NULL OR department = $2)
          AND status IN ('waiting','called','in_progress')
        GROUP BY department`,
      [facilityId, department ?? null],
    ),
  ]);
  res.json({ queue: [...activeEntries.rows, ...waitingEntries.rows], counts: countsResult.rows, enabled: true, displayContent: settings.publicDisplayContent ?? {}, patientDisplayLibrary: publicDisplayLibrary });
}));

app.use("/api", (_req, _res, next) => next(new ApiError(404, "NOT_FOUND", "API endpoint was not found.")));

const distDirectory = resolve(process.cwd(), "dist");
if (process.env.NODE_ENV === "production" && existsSync(distDirectory)) {
  app.use(express.static(distDirectory, { index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(distDirectory, "index.html")));
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `${field}${issue?.message ?? "Check the submitted details."}` } });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (isUniqueViolation(error)) {
    res.status(409).json({ error: { code: "CONFLICT", message: "That record already exists." } });
    return;
  }
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } });
});

async function createSession(userId: string, res: Response, rememberMe = false): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const maxAge = rememberMe ? SESSION_LIFETIME_MS : SESSION_DEFAULT_LIFETIME_MS;
  const expiresAt = new Date(Date.now() + maxAge);
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)", [sha256(token), userId, expiresAt]);
  setSessionCookie(res, token, maxAge);
}

async function getUserById(userId: string): Promise<AuthenticatedUser> {
  const result = await pool.query<AuthenticatedUser>(
    `SELECT u.id, u.facility_id AS "facilityId", f.name AS "facilityName",
            u.full_name AS "fullName", u.email, u.job_title AS "jobTitle", u.account_role AS "accountRole"
       FROM users u JOIN facilities f ON f.id = u.facility_id
      WHERE u.id = $1 AND u.disabled_at IS NULL`,
    [userId],
  );
  const user = result.rows[0];
  if (!user) throw new ApiError(401, "ACCOUNT_DISABLED", "This account is no longer active.");
  return user;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

function parseDepartment(value: string): Department {
  if ((departments as readonly string[]).includes(value)) return value as Department;
  throw new ApiError(400, "INVALID_DEPARTMENT", "Choose a valid department.");
}

function parseStatus(value: string): QueueStatus {
  const allowed: readonly string[] = ["waiting", "called", "in_progress", "completed", "cancelled"];
  if (allowed.includes(value)) return value as QueueStatus;
  throw new ApiError(400, "INVALID_STATUS", "Choose a valid queue status.");
}

function singleRouteParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  throw new ApiError(400, "INVALID_ROUTE_PARAMETER", "The requested record identifier is invalid.");
}

function validDate(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) throw new ApiError(400, "INVALID_DATE", "Enter a valid date of birth.");
  const [year, month, day] = parts.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month! - 1 || parsed.getUTCDate() !== day) {
    throw new ApiError(400, "INVALID_DATE", "Enter a valid date of birth.");
  }
  return value;
}

async function queryQueue(
  facilityId: string,
  department: Department | undefined,
  statuses: readonly QueueStatus[],
  limit: number,
  entryId?: string,
  offset = 0,
): Promise<Array<Record<string, unknown> & { ticketNumber: string; department: string; status: string; priority: string; checkedInAt: Date }>> {
  const result = await pool.query(
    `SELECT q.id, q.ticket_number AS "ticketNumber", q.department, q.status, q.priority, q.reason,
            q.checked_in_at AS "checkedInAt", q.called_at AS "calledAt", q.started_at AS "startedAt",
            q.assigned_user_id AS "assignedUserId", u.full_name AS "assignedUserName",
            p.id AS "patientId", p.first_name AS "firstName", p.last_name AS "lastName",
            p.phone, p.date_of_birth AS "dateOfBirth",
            greatest(0, floor(extract(epoch FROM (now() - coalesce(
              (SELECT max(e.created_at) FROM queue_events e
                WHERE e.queue_entry_id = q.id AND e.action IN ('checked_in','advance') AND e.to_department = q.department),
              q.checked_in_at
            ))) / 60))::int AS "waitMinutes"
       FROM queue_entries q JOIN patients p ON p.id = q.patient_id
       LEFT JOIN users u ON u.id = q.assigned_user_id
      WHERE q.facility_id = $1
        AND ($2::text IS NULL OR q.department = $2)
        AND q.status = ANY($3::text[])
        AND ($4::uuid IS NULL OR q.id = $4)
      ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, q.checked_in_at
      LIMIT $5 OFFSET $6`,
    [facilityId, department ?? null, statuses, entryId ?? null, limit, offset],
  );
  return result.rows;
}

async function start(): Promise<void> {
  if (process.env.NODE_ENV !== "production") await runMigrations(pool);
  await pool.query("SELECT 1");
  const server = app.listen(PORT, API_HOST, () => {
    process.stdout.write(`API listening on http://${API_HOST}:${PORT}\n`);
  });
  const shutdown = async (): Promise<void> => {
    server.close();
    await pool.end();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

start().catch(async (error: unknown) => {
  process.stderr.write(`API startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  await pool.end();
  process.exitCode = 1;
});
