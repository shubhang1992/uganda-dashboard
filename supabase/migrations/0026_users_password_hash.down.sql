-- 0026_users_password_hash.down.sql — drop the password_hash column.
--
-- Destructive: every stored bcrypt digest is lost. Re-applying 0026 only
-- restores the column, not its data — affected users would have to re-set
-- their passwords (or fall back to OTP, which still works against a NULL
-- column).

ALTER TABLE public.users
  DROP COLUMN IF EXISTS password_hash;
