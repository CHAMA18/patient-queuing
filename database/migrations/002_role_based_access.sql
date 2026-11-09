ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_role_check;

-- Existing staff roles did not identify a clinical station. Keep them unassigned
-- until a facility administrator confirms the correct workstation.
UPDATE users
   SET account_role = 'pending_assignment'
 WHERE account_role = 'staff';

ALTER TABLE users
  ADD CONSTRAINT users_account_role_check
  CHECK (account_role IN (
    'admin',
    'receptionist',
    'triage_nurse',
    'clinician',
    'lab_technician',
    'pharmacist',
    'pending_assignment'
  ));

CREATE TABLE facility_invite_codes (
  id uuid PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL UNIQUE,
  account_role text NOT NULL CHECK (account_role IN (
    'receptionist',
    'triage_nurse',
    'clinician',
    'lab_technician',
    'pharmacist',
    'pending_assignment'
  )),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX facility_invite_codes_active_idx
  ON facility_invite_codes (facility_id, created_at DESC)
  WHERE revoked_at IS NULL;

-- Preserve current facility invite codes, but require an administrator to assign
-- a station to anyone who joins with an old, role-neutral code.
INSERT INTO facility_invite_codes (id, facility_id, code_hash, account_role)
SELECT gen_random_uuid(), id, invite_code_hash, 'pending_assignment'
  FROM facilities
ON CONFLICT (code_hash) DO NOTHING;
