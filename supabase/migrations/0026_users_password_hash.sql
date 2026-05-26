-- 0026_users_password_hash.sql
--
-- Phase 1 of the password-auth feature. Adds a nullable `password_hash`
-- column to `public.users` to hold bcrypt digests. The authentication
-- identity table is `users`, keyed UNIQUE(phone, role) — passwords land
-- here (not on `subscribers`) so the same phone can attach to multiple
-- roles with independent passwords.
--
-- NULL semantics: a NULL `password_hash` means the user has not yet set
-- a password and must continue authenticating via OTP. The frontend will
-- prompt password set-up the next time they sign in. No CHECK constraint
-- and no extra index — every login lookup uses the existing UNIQUE(phone,
-- role) index, so an index on `password_hash` would only add write cost.
--
-- Reversible via 0026_users_password_hash.down.sql.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN public.users.password_hash IS
  'bcrypt hash; NULL means user has not set a password (use OTP).';
