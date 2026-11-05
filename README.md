# Moms Care Flow — Patient Queuing & Flow Management

A full-stack **patient queuing and hospital flow command centre** for the Maternity & Paediatric wing of **Lusaka Central Hospital** (Zambia, CAT timezone). Built with Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma (SQLite) and Socket.IO.

> All times in the app are rendered in Central Africa Time (Africa/Lusaka, UTC+2).

## Modules

| Module | What it does |
| --- | --- |
| **Overview / Hospital Command Centre** | Live KPIs (registered, waiting, attended, completed, avg wait, longest queue), Living Patient Flow Map with per-department throughput, Bottleneck Radar with actionable alerts, Live Queue Movement feed, quick command actions, daily CSV report export |
| **OPD Reception** | Register mothers/children, auto ticketing (`MC-0xx`), lounge & seat assignment, today's registration log |
| **Vitals Station** | 3 triage bays, call-next FIFO with priority override, vitals capture (BP, weight, temp, pulse, fetal doppler), **auto red-flag rules** (BP ≥ 160/100 or fever ≥ 38.5 °C → Priority Red + expedited routing) |
| **Consultation Room** | Rooms 01–05 + sonography bay, session timers with overrun warnings, order lab panels, raise prescriptions, advice-only discharge |
| **Laboratory** | Specimen queue & processing benches, result capture, **auto-recall to Consultation Room 01** when results are ready |
| **Pharmacy** | Dispensing windows 1–2, prescription handover, visit completion with dwell time |
| **Waiting TV Displays** | Full-screen "NOW SERVING" board for lounge TVs — live calls per room/bay/window, up-next tickets per stage, big CAT clock, ticker |
| **Hospital Flow Settings** | Flow targets & capacity thresholds, staff roster management, one-click demo-day reset |

## Patient journey

```
REGISTRATION → VITALS → CONSULTATION → (LAB → REVIEW)? → PHARMACY → COMPLETED
```

Every transition writes an audit event, which powers the live feed, the full audit trail and the daily report.

## Live updates

- A Socket.IO mini-service (`mini-services/queue-service`, port `3003`) broadcasts `queue:update` on every mutation.
- The UI subscribes via `io("/?XTransformPort=3003")` through the gateway and additionally polls every 10 s as a fallback ("Syncing every 10s").
- Behind the gateway, mutations reach the service through an internal push endpoint on port `3004`.

## Getting started

```bash
bun install
bun run db:push        # create SQLite schema (db/custom.db)
bun run dev            # Next.js on :3000 — seeds the demo day on first request
cd mini-services/queue-service && bun run dev   # optional: live socket broadcasts
```

On first API request the database is **seeded** with a realistic demo day for Lusaka Central Hospital: 184 registrations, 42 waiting across six stations, the MC-015/018/019/022/024/025 scenario from the product mockup, a red-flag triage case (MC-020) and a lab-centrifuge bottleneck alert. `Hospital Flow Settings → Reset Demo Day` restores this state at any time.

## Key APIs

| Endpoint | Purpose |
| --- | --- |
| `GET /api/dashboard` | KPIs, flow-map nodes, bottleneck alerts, live feed |
| `GET /api/patients?stage=X` / `?scope=today` | Station queues / registration log |
| `POST /api/patients` | Register a patient (auto ticket) |
| `PATCH /api/patients/[id]` | Station transitions: `callNext`, `completeVitals`, `startConsult`, `endConsult`, `labProcess`, `reviewDone`, `dispense`, `setPriority` |
| `GET /api/display` | TV board payload (now serving + up-next) |
| `POST /api/actions` | Command actions: `fast-track`, `route-satellite`, `split-queue`, `overflow`, `reallocate`, `broadcast`, `escalate`, `resolve-alert` |
| `GET /api/settings` · `PATCH` · `POST` | Flow settings, staff roster, demo reset |
| `GET /api/audit` | Full audit trail |
| `GET /api/report` | Daily operational report (CSV download) |

## Stack

- **Next.js 16 (App Router) + TypeScript** — single-route SPA shell (`/`) with hash-based module switching (TV board gets its own `#display` screen)
- **Tailwind CSS 4** with a Material Design 3 teal palette and the Plus Jakarta Sans / Inter / Manrope type ramp
- **shadcn/ui** for overlays (dialogs, popovers, selects, toasts)
- **Prisma + SQLite** — Patient, Vitals, Prescription, LabTest, Event, Staff, Setting models
- **Socket.IO** mini-service for real-time queue broadcasts
