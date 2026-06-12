-- =============================================================================
-- Universal Pensions Uganda — 0061: block re-tagging a subscriber to an
-- INACTIVE employer on UPDATE (closes the 0060 BEFORE-INSERT-only gap)
-- =============================================================================
-- 0060 added trg_block_inactive_employer_subscriber (BEFORE INSERT) so a
-- deactivated employer cannot admit a brand-new member. But the employer
-- invite-completion + onboard RPCs attach an EXISTING subscriber by UPDATE:
--   * create_subscriber_from_employer_invite  — branch (a): existing sub with no
--     employer -> UPDATE subscribers SET employer_id = v_inv.employer_id  (anon,
--     login-independent: a pending invite minted before deactivation stays
--     completable after).
--   * create_subscriber_from_employer_invite  — collect_schedule branch: INSERT
--     with employer_id = NULL (passes the INSERT trigger), then UPDATE … SET
--     employer_id = v_inv.employer_id.
--   * create_subscriber_from_employer_onboard — existing-sub branch: UPDATE …
--     SET employer_id = calling_employer_id.
-- The only existing UPDATE trigger on subscribers (subscribers_enforce_editable_cols)
-- does not look at employer status, so all three paths bypass the 0060 guarantee.
--
-- FIX (additive, mirrors 0060's trigger approach — no RPC bodies are touched):
-- a BEFORE UPDATE trigger that blocks ONLY a re-tag of employer_id to an
-- inactive employer. It is deliberately scoped with
--   NEW.employer_id IS NOT NULL AND NEW.employer_id IS DISTINCT FROM OLD.employer_id
-- so it never interferes with:
--   * detach (employer_id -> NULL): the deactivation cascade's own UPDATE in
--     set_employer_status / set_distributor_status passes untouched.
--   * any other column update (balance, kyc, agent_id, …) on a subscriber whose
--     employer happens to be inactive: employer_id is unchanged, so the status
--     subquery is never evaluated (AND short-circuits) and the row passes.
--   * re-tag to an ACTIVE employer (a legitimate transfer / first attach).
-- Triggers are OFF during the seed (session_replication_role='replica'), so
-- seeding is unaffected — exactly like the 0060 triggers.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_inactive_employer_subscriber_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.employer_id IS NOT NULL
     AND NEW.employer_id IS DISTINCT FROM OLD.employer_id
     AND (SELECT status FROM public.employers WHERE id = NEW.employer_id) = 'inactive' THEN
    RAISE EXCEPTION 'employer % is deactivated and cannot admit new members', NEW.employer_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_inactive_employer_subscriber_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_block_inactive_employer_subscriber_update ON public.subscribers;
CREATE TRIGGER trg_block_inactive_employer_subscriber_update
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_employer_subscriber_update();

-- =============================================================================
-- End of 0061_block_inactive_employer_retag.sql
-- =============================================================================
