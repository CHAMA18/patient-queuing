# PostgreSQL setup

The application targets PostgreSQL 18. Set the connection with `DATABASE_URL` or the `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` variables. The local Homebrew setup defaults to a socket in `/tmp` and the `patient_flow` database.

Apply the SQL files in `migrations/` with `npm run db:migrate`. Development startup applies pending migrations automatically. Production deployments should run migrations as an explicit release step before starting the API.

The schema creates facility-scoped users, secure sessions, patients, queue entries, queue audit events, staff messages, and role-specific team invitations. It contains no seed rows. Registration creates the first facility administrator. Administrators can create invitations for Reception, Vitals and Triage, Consultation, Laboratory, Radiology and ultrasound Scan, or Pharmacy; accounts joining with an older role-neutral invite are held in pending access until an administrator assigns a role.

Access follows least privilege: administrators can manage the full facility, while each clinical role can see and work only its matching station. The API checks these permissions on every protected request. Existing generic staff accounts are migrated to pending access because their previous records do not identify a station; an administrator must assign their role before they can view patient information.

For a local Docker database, copy `.env.example` to `.env`, configure a strong password, and use `npm run db:compose:up`. The container publishes only on `127.0.0.1:5433` and stores database files in a named Docker volume.
