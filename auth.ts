import { apiRequest } from "./api-client";
import type { AccountRole } from "./roles";

export type AuthMode = "login" | "register";

export interface AuthUser {
  readonly id: string;
  readonly facilityId: string;
  readonly facilityName: string;
  readonly fullName: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly accountRole: AccountRole;
}

export interface AuthenticatedResult {
  readonly user: AuthUser;
  readonly inviteCode?: string;
  readonly inviteCodeRole?: AccountRole;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function authHref(mode: AuthMode): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("screen");
  url.searchParams.set("auth", mode);
  return `${url.pathname}${url.search}`;
}

const icons = {
  eye: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.4 12s3.45-6 9.6-6 9.6 6 9.6 6-3.45 6-9.6 6-9.6-6-9.6-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.15 0 9.6 6 9.6 6a15 15 0 0 1-3.1 3.7M6.3 6.4C3.8 8.1 2.4 12 2.4 12s3.45 6 9.6 6c1.2 0 2.3-.25 3.3-.65"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`,
};

function field(id: string, label: string, name: string, type: string, placeholder: string, autocomplete: string, required = true, extra = ""): string {
  return `<label class="auth-field" for="${id}"><span>${label}</span><input id="${id}" name="${name}" type="${type}" autocomplete="${autocomplete}" placeholder="${placeholder}" ${required ? "required" : ""} ${extra}/></label>`;
}

function passwordField(id: string, label: string, name: string, placeholder: string, autocomplete: string, extra = ""): string {
  return `<label class="auth-field" for="${id}"><span>${label}</span><span class="auth-input-wrap"><input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" required ${extra}/><button class="auth-password-toggle" type="button" data-password-toggle="${id}" aria-label="Show password">${icons.eye}</button></span></label>`;
}

function formMarkup(mode: AuthMode): string {
  if (mode === "login") {
    return `<div class="auth-heading"><span class="auth-eyebrow" data-login-eyebrow>STAFF WORKSPACE</span><h1 id="auth-title">Welcome back</h1><p data-login-description>Sign in to continue to your care team workspace.</p></div>
      <form class="auth-form" id="login-form">
        <fieldset class="auth-role-picker" aria-describedby="login-role-description">
          <legend>I’m signing in as</legend>
          <div class="auth-role-options">
            <label class="auth-role-option">
              <input type="radio" name="accountType" value="staff" checked/>
              <span class="auth-role-option-surface"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M16 4.2a3.5 3.5 0 0 1 0 6.6M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35"/></svg><span class="auth-role-copy"><strong>Staff</strong><small>Care team</small></span><span class="auth-role-selected" aria-hidden="true"></span></span>
            </label>
            <label class="auth-role-option">
              <input type="radio" name="accountType" value="admin"/>
              <span class="auth-role-option-surface"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg><span class="auth-role-copy"><strong>Admin</strong><small>Facility admin</small></span><span class="auth-role-selected" aria-hidden="true"></span></span>
            </label>
          </div>
          <p class="auth-role-description" id="login-role-description" aria-live="polite">For care team members working at an assigned station.</p>
        </fieldset>
        ${field("login-email", "Work email", "email", "email", "you@facility.org", "username")}
        ${passwordField("login-password", "Password", "password", "Enter your password", "current-password")}
        <div class="auth-options"><label class="auth-checkbox"><input type="checkbox" name="rememberMe"/><span class="auth-checkmark" aria-hidden="true"></span><span>Keep me signed in</span></label><span class="auth-help-note">Need help? Contact your facility team.</span></div>
        <div class="auth-feedback" id="auth-feedback" role="status" aria-live="polite" hidden></div>
        <button class="auth-submit" type="submit"><span>Sign in as Staff</span>${icons.arrow}</button>
        <p class="auth-form-note">Your account is protected by a secure server session.</p>
      </form><div class="auth-switch"><span>New to Mum’s Care?</span><a href="${authHref("register")}">Set up a facility</a></div>`;
  }
  return `<div class="auth-heading auth-heading-register"><span class="auth-eyebrow">CARE TEAM ACCESS</span><h1 id="auth-title">Create your workspace</h1><p>Start a new facility workspace or join your team with an invite code.</p></div>
    <form class="auth-form auth-register-form" id="register-form">
      <fieldset class="auth-role-picker" aria-describedby="register-role-description">
        <legend>I’m registering as</legend>
        <div class="auth-role-options">
          <label class="auth-role-option">
            <input type="radio" name="accountType" value="staff"/>
            <span class="auth-role-option-surface"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M16 4.2a3.5 3.5 0 0 1 0 6.6M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35"/></svg><span class="auth-role-copy"><strong>Staff</strong><small>Care team</small></span><span class="auth-role-selected" aria-hidden="true"></span></span>
          </label>
          <label class="auth-role-option">
            <input type="radio" name="accountType" value="admin" checked/>
            <span class="auth-role-option-surface"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg><span class="auth-role-copy"><strong>Admin</strong><small>Facility admin</small></span><span class="auth-role-selected" aria-hidden="true"></span></span>
          </label>
        </div>
        <p class="auth-role-description" id="register-role-description" aria-live="polite">Create a new facility workspace and manage operations and team access.</p>
      </fieldset>
      ${field("register-name", "Full name", "fullName", "text", "Your name", "name")}
      ${field("register-email", "Work email", "email", "email", "you@facility.org", "email")}
      ${field("register-facility", "Facility name", "facilityName", "text", "Only needed when creating a facility", "organization", false)}
      <p class="auth-field-note" id="register-facility-note">Required when creating a new facility. Enter an invite code to join a team.</p>
      ${field("register-invite-code", "Team invite code", "inviteCode", "text", "Leave blank to create a facility", "off", false)}
      ${field("register-job-title", "Job title", "jobTitle", "text", "Your role on the care team", "organization-title")}
      ${passwordField("register-password", "Password", "password", "At least 10 characters and one number", "new-password", 'minlength="10" pattern="(?=.*[0-9]).{10,}" title="Use at least 10 characters, including a number." maxlength="256" aria-describedby="password-hint"')}
      ${passwordField("register-confirm-password", "Confirm password", "confirmPassword", "Enter your password again", "new-password", 'minlength="10" pattern="(?=.*[0-9]).{10,}" title="Use at least 10 characters, including a number." maxlength="256" aria-describedby="password-hint"')}
      <p class="auth-password-hint" id="password-hint" aria-live="polite">Use at least 10 characters, including a number.</p>
      <label class="auth-checkbox auth-terms"><input type="checkbox" name="terms" required/><span class="auth-checkmark" aria-hidden="true"></span><span>I am authorized to join this care facility workspace.</span></label>
      <div class="auth-feedback" id="auth-feedback" role="status" aria-live="polite" hidden></div>
      <button class="auth-submit" type="submit"><span>Create secure account</span>${icons.arrow}</button>
    </form><div class="auth-switch"><span>Already have an account?</span><a href="${authHref("login")}">Sign in</a></div>`;
}

function showFeedback(root: HTMLElement, message: string, tone: "info" | "error" = "info"): void {
  const feedback = root.querySelector<HTMLDivElement>("#auth-feedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.tone = tone;
  feedback.hidden = false;
}

function setSubmitting(form: HTMLFormElement, value: boolean, label: string): void {
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submit) return;
  submit.disabled = value;
  if (value) submit.setAttribute("aria-busy", "true");
  else submit.removeAttribute("aria-busy");
  const span = submit.querySelector("span");
  if (span) span.textContent = label;
}

function wirePasswordToggles(root: HTMLElement): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-password-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.dataset.passwordToggle;
      const input = id ? root.querySelector<HTMLInputElement>(`#${id}`) : null;
      if (!input) return;
      input.type = input.type === "text" ? "password" : "text";
      const visible = input.type === "text";
      button.innerHTML = visible ? icons.eyeOff : icons.eye;
      button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    });
  }
}

function wireLogin(root: HTMLElement, onAuthenticated: (result: AuthenticatedResult) => void): void {
  const form = root.querySelector<HTMLFormElement>("#login-form");
  const roleDescription = root.querySelector<HTMLElement>("#login-role-description");
  const eyebrow = root.querySelector<HTMLElement>("[data-login-eyebrow]");
  const headingDescription = root.querySelector<HTMLElement>("[data-login-description]");
  const selectedRole = (): "admin" | "staff" => form?.querySelector<HTMLInputElement>('input[name="accountType"]:checked')?.value === "admin" ? "admin" : "staff";
  const roleName = (role: "admin" | "staff"): string => role === "admin" ? "Admin" : "Staff";
  const syncRoleCopy = (): void => {
    const role = selectedRole();
    const admin = role === "admin";
    if (roleDescription) roleDescription.textContent = admin
      ? "For facility leaders managing operations and team access."
      : "For care team members working at an assigned station.";
    if (eyebrow) eyebrow.textContent = admin ? "ADMIN WORKSPACE" : "STAFF WORKSPACE";
    if (headingDescription) headingDescription.textContent = admin
      ? "Sign in to manage your facility workspace."
      : "Sign in to continue to your care team workspace.";
    const submitButton = form?.querySelector<HTMLButtonElement>(".auth-submit");
    const submitLabel = submitButton?.querySelector<HTMLElement>("span");
    if (submitButton && submitLabel && !submitButton.disabled) {
      submitLabel.textContent = `Sign in as ${roleName(role)}`;
    }
  };
  form?.querySelectorAll<HTMLInputElement>('input[name="accountType"]').forEach((input) => {
    input.addEventListener("change", syncRoleCopy);
  });
  syncRoleCopy();
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const accountType = selectedRole();
    const rolePicker = form.querySelector<HTMLFieldSetElement>(".auth-role-picker");
    if (rolePicker) rolePicker.disabled = true;
    setSubmitting(form, true, "Signing in…");
    try {
      const result = await postJson<{ user: AuthUser }>("/api/auth/login", {
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
        rememberMe: data.get("rememberMe") === "on",
        accountType,
      });
      onAuthenticated({ user: result.user });
    } catch (error) {
      if (rolePicker) rolePicker.disabled = false;
      setSubmitting(form, false, `Sign in as ${roleName(selectedRole())}`);
      showFeedback(root, getErrorMessage(error), "error");
    }
  });
}

function wireRegistration(root: HTMLElement, onAuthenticated: (result: AuthenticatedResult) => void): void {
  const form = root.querySelector<HTMLFormElement>("#register-form");
  const inviteCode = root.querySelector<HTMLInputElement>("#register-invite-code");
  const facilityName = root.querySelector<HTMLInputElement>("#register-facility");
  const facilityNote = root.querySelector<HTMLElement>("#register-facility-note");
  const roleDescription = root.querySelector<HTMLElement>("#register-role-description");
  const selectedRole = (): "admin" | "staff" => form?.querySelector<HTMLInputElement>('input[name="accountType"]:checked')?.value === "admin" ? "admin" : "staff";
  const submitLabel = (): string => `Create ${selectedRole() === "admin" ? "Admin" : "Staff"} account`;
  const syncFormMode = (): void => {
    const admin = selectedRole() === "admin";
    const joiningTeam = Boolean(inviteCode?.value.trim());
    if (inviteCode) {
      inviteCode.required = !admin;
      inviteCode.setAttribute("aria-required", String(!admin));
      inviteCode.placeholder = admin ? "Leave blank to create your facility" : "Enter your team invite code";
    }
    if (facilityName) {
      const required = admin || !joiningTeam;
      facilityName.required = required;
      facilityName.setAttribute("aria-required", String(required));
      facilityName.placeholder = admin ? "Your care facility" : "Optional when joining a team";
    }
    if (facilityNote) {
      facilityNote.textContent = admin
        ? "You will be the administrator of this facility workspace."
        : joiningTeam
          ? "Joining with an invite code? You can leave this blank."
          : "Required when creating a new facility. Enter an invite code to join a team.";
    }
    if (roleDescription) {
      roleDescription.textContent = admin
        ? "Create a new facility workspace and manage operations and team access."
        : "Join your care team workspace with the invite code from your administrator.";
    }
    const submitSpan = form?.querySelector<HTMLButtonElement>(".auth-submit span");
    if (submitSpan) submitSpan.textContent = submitLabel();
  };
  form?.querySelectorAll<HTMLInputElement>('input[name="accountType"]').forEach((input) => input.addEventListener("change", syncFormMode));
  inviteCode?.addEventListener("input", syncFormMode);
  syncFormMode();
  const password = root.querySelector<HTMLInputElement>("#register-password");
  const confirmPassword = root.querySelector<HTMLInputElement>("#register-confirm-password");
  password?.addEventListener("input", () => {
    const valid = password.value.length >= 10 && /\d/.test(password.value);
    const hint = root.querySelector<HTMLElement>("#password-hint");
    if (hint) {
      hint.textContent = valid ? "Your password meets the minimum requirements." : "Use at least 10 characters, including a number.";
      hint.classList.toggle("is-valid", valid);
    }
    confirmPassword?.setCustomValidity(confirmPassword.value && confirmPassword.value !== password.value ? "Passwords do not match." : "");
  });
  confirmPassword?.addEventListener("input", () => confirmPassword.setCustomValidity(confirmPassword.value !== password?.value ? "Passwords do not match." : ""));
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const rolePicker = form.querySelector<HTMLFieldSetElement>(".auth-role-picker");
    if (rolePicker) rolePicker.disabled = true;
    setSubmitting(form, true, "Creating your account…");
    try {
      const result = await postJson<AuthenticatedResult>("/api/auth/register", {
        fullName: String(data.get("fullName") ?? ""),
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
        facilityName: String(data.get("facilityName") ?? ""),
        inviteCode: String(data.get("inviteCode") ?? ""),
        jobTitle: String(data.get("jobTitle") ?? ""),
        accountType: selectedRole(),
      });
      onAuthenticated(result);
    } catch (error) {
      if (rolePicker) rolePicker.disabled = false;
      setSubmitting(form, false, submitLabel());
      showFeedback(root, getErrorMessage(error), "error");
      if (error && typeof error === "object" && "code" in error && error.code === "INVITE_CODE_REQUIRED") {
        root.querySelector<HTMLInputElement>("#register-invite-code")?.focus();
      }
    }
  });
}

export function mountAuth(root: HTMLElement, mode: AuthMode, onAuthenticated: (result: AuthenticatedResult) => void): void {
  root.className = `auth-shell auth-mode-${mode}`;
  root.innerHTML = `<div class="auth-layout">
    <section class="auth-story" aria-labelledby="auth-story-title">
      <video class="auth-story-video" autoplay muted loop playsinline preload="auto" poster="/media/authentication-background-poster.jpg" aria-hidden="true" tabindex="-1">
        <source src="/media/authentication-background.mp4" type="video/mp4" />
      </video>
      <div class="auth-story-video-shade" aria-hidden="true"></div>
      <div class="auth-story-texture" aria-hidden="true"></div>
      <div class="auth-story-main"><div class="auth-story-kicker"><span></span> CARE FLOW PLATFORM <b>•</b> ZAMBIA</div>
        <h2 id="auth-story-title">More clarity<br/><em>in every journey.</em></h2>
        <p>One secure workspace to help your team coordinate patient flow with confidence and care.</p>
      </div><div class="auth-story-footer"><span>Care, in sync.</span><span>© Mum’s Care</span></div>
    </section>
    <section class="auth-panel" aria-labelledby="auth-title"><div class="auth-panel-top"><a class="auth-panel-brand" href="${authHref("login")}" aria-label="Mum’s Care sign in"><img src="/mums-care-logo.png" alt="Mum’s Care Hospital"/></a></div><div class="auth-content">${formMarkup(mode)}</div><footer class="auth-panel-footer"><span>Need access? Contact your facility administrator.</span><span class="auth-footer-mark">MC</span></footer></section>
  </div>`;
  const storyVideo = root.querySelector<HTMLVideoElement>(".auth-story-video");
  if (storyVideo && window.matchMedia("(prefers-reduced-motion: reduce)").matches) storyVideo.pause();
  wirePasswordToggles(root);
  if (mode === "login") wireLogin(root, onAuthenticated);
  else wireRegistration(root, onAuthenticated);
}
