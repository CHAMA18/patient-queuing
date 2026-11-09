# Mum’s Care · Hospital Flow Command Centre

TypeScript web application for coordinating patient flow at a care facility. The UI reads and writes PostgreSQL-backed records through the Express API. The database starts empty; no demo accounts, patients, messages or queue entries are inserted.

## Requirements

- Node.js 22 or later
- PostgreSQL 18

## Run locally

Start PostgreSQL and create the application database and user. For a local Homebrew installation, the configured defaults use the local PostgreSQL socket and database name `patient_flow`:

```sh
npm install
npm run db:up
npm run db:migrate
npm run dev
```

Open the Vite URL printed by the command (normally [http://127.0.0.1:4173](http://127.0.0.1:4173)). The development server runs the API on port 3001 and proxies `/api` requests to it. Set `DATABASE_URL` or `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` to connect to another PostgreSQL instance.

The first registration for a new facility creates its administrator account and a one-time team invite code. Save that code and share it only with facility staff. Later staff accounts need that code. There are no default login credentials.

## Database

SQL migrations are stored in `database/migrations/`. Apply pending migrations with `npm run db:migrate`; the API also checks migrations during local development. For Docker-based PostgreSQL, copy `.env.example` to `.env`, set a strong password, and run `npm run db:compose:up`. The Docker database binds to localhost port 5433 and persists data in a named volume.

Useful database commands:

```sh
npm run db:status
npm run db:down
npm run db:compose:status
npm run db:compose:logs
```

## API

The API is mounted under `/api`. It provides server-side registration and login sessions, facility preferences and invite-code rotation, staff lookup, live dashboard aggregates, patient check-in, queue transitions and staff assignment, team messages, public-display-safe ticket data, and a PostgreSQL health check at `GET /api/health`.

Patient and facility queries are scoped to the signed-in staff member’s facility. Patient-facing queue responses include ticket numbers and queue state only, never names or clinical details. Passwords are stored as scrypt hashes, and the browser receives only an HTTP-only session cookie.

## Build and start

```sh
npm run build
npm start
```

Configure production database variables before starting the API. Apply database migrations as a release step with `npm run db:migrate`.
