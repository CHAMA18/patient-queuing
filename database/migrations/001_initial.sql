CREATE TABLE facilities (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Africa/Lusaka',
  invite_code_hash char(64) NOT NULL,
  ticket_counter bigint NOT NULL DEFAULT 0 CHECK (ticket_counter >= 0),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  job_title text NOT NULL,
  account_role text NOT NULL CHECK (account_role IN ('admin', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));
CREATE INDEX users_facility_active_idx ON users (facility_id, full_name) WHERE disabled_at IS NULL;

CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE patients (
  id uuid PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  identifier text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  date_of_birth date,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE INDEX patients_facility_name_idx ON patients (facility_id, lower(last_name), lower(first_name)) WHERE retired_at IS NULL;
CREATE INDEX patients_facility_identifier_idx ON patients (facility_id, identifier) WHERE identifier IS NOT NULL;

CREATE TABLE queue_entries (
  id uuid PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id),
  ticket_number text NOT NULL,
  department text NOT NULL CHECK (department IN ('reception', 'vitals', 'consultation', 'laboratory', 'pharmacy')),
  status text NOT NULL CHECK (status IN ('waiting', 'called', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard', 'priority', 'urgent')),
  reason text NOT NULL,
  assigned_user_id uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, ticket_number)
);

CREATE INDEX queue_entries_active_idx ON queue_entries (facility_id, department, status, priority, checked_in_at)
  WHERE status IN ('waiting', 'called', 'in_progress');
CREATE INDEX queue_entries_today_idx ON queue_entries (facility_id, checked_in_at DESC);

CREATE TABLE queue_events (
  id uuid PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  queue_entry_id uuid NOT NULL REFERENCES queue_entries(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  from_department text,
  to_department text,
  from_status text,
  to_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX queue_events_entry_idx ON queue_events (queue_entry_id, created_at);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_facility_recent_idx ON messages (facility_id, created_at DESC);
