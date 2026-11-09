ALTER TABLE queue_entries DROP CONSTRAINT IF EXISTS queue_entries_department_check;
ALTER TABLE queue_entries
  ADD CONSTRAINT queue_entries_department_check
  CHECK (department IN ('reception', 'vitals', 'consultation', 'laboratory', 'radiology', 'pharmacy'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_account_role_check
  CHECK (account_role IN (
    'admin',
    'receptionist',
    'triage_nurse',
    'clinician',
    'lab_technician',
    'radiology_technician',
    'pharmacist',
    'pending_assignment'
  ));

ALTER TABLE facility_invite_codes DROP CONSTRAINT IF EXISTS facility_invite_codes_account_role_check;
ALTER TABLE facility_invite_codes
  ADD CONSTRAINT facility_invite_codes_account_role_check
  CHECK (account_role IN (
    'receptionist',
    'triage_nurse',
    'clinician',
    'lab_technician',
    'radiology_technician',
    'pharmacist',
    'pending_assignment'
  ));
