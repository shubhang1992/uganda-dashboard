-- =============================================================================
-- 0005 — Fix infinite-recursion in subscribers UPDATE policy
-- =============================================================================
-- The original `subscribers_update_self` policy (in 0003) pinned non-editable
-- columns via correlated subqueries against `subscribers` inside its WITH CHECK
-- clause. Postgres treats that subquery as another row-level check on the same
-- table, producing infinite recursion at evaluation time (verified empirically:
-- ERROR: infinite recursion detected in policy for relation "subscribers").
--
-- Fix: simplify the policy to ownership-only, and enforce column immutability
-- via a BEFORE UPDATE trigger that compares OLD vs NEW directly — triggers do
-- not re-evaluate RLS, so the recursion goes away.
-- =============================================================================

DROP POLICY IF EXISTS subscribers_update_self ON subscribers;

CREATE POLICY subscribers_update_self ON subscribers
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
  );

-- BEFORE UPDATE trigger: editable columns are name, email, phone, occupation,
-- consent_at. Any change to any other column from a subscriber-role caller is
-- rejected. Distributor / service-role updates bypass this trigger (the trigger
-- only fires for subscriber-role JWTs).
CREATE OR REPLACE FUNCTION trg_subscribers_enforce_editable_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT := auth.jwt() ->> 'role';
BEGIN
  -- Only subscribers are constrained; everyone else passes through.
  IF v_role IS DISTINCT FROM 'subscriber' THEN
    RETURN NEW;
  END IF;

  -- Non-editable columns must remain unchanged.
  IF NEW.id                        IS DISTINCT FROM OLD.id                        THEN RAISE EXCEPTION 'cannot modify id';                        END IF;
  IF NEW.gender                    IS DISTINCT FROM OLD.gender                    THEN RAISE EXCEPTION 'cannot modify gender';                    END IF;
  IF NEW.age                       IS DISTINCT FROM OLD.age                       THEN RAISE EXCEPTION 'cannot modify age';                       END IF;
  IF NEW.dob                       IS DISTINCT FROM OLD.dob                       THEN RAISE EXCEPTION 'cannot modify dob';                       END IF;
  IF NEW.nin                       IS DISTINCT FROM OLD.nin                       THEN RAISE EXCEPTION 'cannot modify nin';                       END IF;
  IF NEW.agent_id                  IS DISTINCT FROM OLD.agent_id                  THEN RAISE EXCEPTION 'cannot modify agent_id';                  END IF;
  IF NEW.district_id               IS DISTINCT FROM OLD.district_id               THEN RAISE EXCEPTION 'cannot modify district_id';               END IF;
  IF NEW.kyc_status                IS DISTINCT FROM OLD.kyc_status                THEN RAISE EXCEPTION 'cannot modify kyc_status';                END IF;
  IF NEW.is_active                 IS DISTINCT FROM OLD.is_active                 THEN RAISE EXCEPTION 'cannot modify is_active';                 END IF;
  IF NEW.is_demo_signup            IS DISTINCT FROM OLD.is_demo_signup            THEN RAISE EXCEPTION 'cannot modify is_demo_signup';            END IF;
  IF NEW.insurance_same_as_pension IS DISTINCT FROM OLD.insurance_same_as_pension THEN RAISE EXCEPTION 'cannot modify insurance_same_as_pension'; END IF;
  IF NEW.registered_date           IS DISTINCT FROM OLD.registered_date           THEN RAISE EXCEPTION 'cannot modify registered_date';           END IF;
  IF NEW.last_contribution_date    IS DISTINCT FROM OLD.last_contribution_date    THEN RAISE EXCEPTION 'cannot modify last_contribution_date';    END IF;
  IF NEW.contribution_history      IS DISTINCT FROM OLD.contribution_history      THEN RAISE EXCEPTION 'cannot modify contribution_history';      END IF;
  IF NEW.products_held             IS DISTINCT FROM OLD.products_held             THEN RAISE EXCEPTION 'cannot modify products_held';             END IF;
  IF NEW.current_unit_value        IS DISTINCT FROM OLD.current_unit_value        THEN RAISE EXCEPTION 'cannot modify current_unit_value';        END IF;
  IF NEW.unit_value_as_of          IS DISTINCT FROM OLD.unit_value_as_of          THEN RAISE EXCEPTION 'cannot modify unit_value_as_of';          END IF;
  IF NEW.created_at                IS DISTINCT FROM OLD.created_at                THEN RAISE EXCEPTION 'cannot modify created_at';                END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscribers_enforce_editable_cols ON subscribers;
CREATE TRIGGER subscribers_enforce_editable_cols
  BEFORE UPDATE ON subscribers
  FOR EACH ROW
  EXECUTE FUNCTION trg_subscribers_enforce_editable_cols();
