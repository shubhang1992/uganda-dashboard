-- 0024_upsert_nominees.sql
--
-- Closes AUDIT-2-3 (subscriber.js does direct .delete/.insert on nominees —
-- bypasses every RPC invariant) and AUDIT-4-6 / BACKEND.md §14b (nominee
-- shares can sum >100% silently).
--
-- Strategy:
--   1. Add a row-level CHECK constraint on `share` (defense in depth — the
--      table column is called `share` per schema, not `share_pct`).
--   2. Author `upsert_nominees(p_subscriber_id, p_pension, p_insurance)` as
--      a SECURITY DEFINER RPC that DELETEs + INSERTs in one transaction and
--      asserts SUM(share) per type rounds to 100 (or zero rows total).
--   3. Service-layer fix lands separately (subscriber.js refactor).

-- =============================================================================
-- (1) Row-level CHECK constraint on share (0..100)
-- =============================================================================
-- Use NOT VALID first so existing rows don't block the migration (we'll
-- VALIDATE after a one-off cleanup if needed; the CHECK still applies to
-- all new INSERTs/UPDATEs immediately).
ALTER TABLE public.nominees
  ADD CONSTRAINT nominees_share_range_chk CHECK (share BETWEEN 0 AND 100) NOT VALID;

-- =============================================================================
-- (2) upsert_nominees RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.upsert_nominees(
  p_subscriber_id TEXT,
  p_pension       JSONB DEFAULT '[]'::jsonb,
  p_insurance     JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role           TEXT := COALESCE(auth.jwt() ->> 'app_role', '');
  v_subscriber_id  TEXT := auth.jwt() ->> 'subscriberId';
  v_pension_count  INT;
  v_insurance_count INT;
  v_pension_sum    NUMERIC;
  v_insurance_sum  NUMERIC;
  v_base_ts        BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
BEGIN
  -- Role gate. Subscriber updates own; admin can update any (for support
  -- workflows). Other roles rejected.
  IF v_role = '' THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('subscriber', 'admin') THEN
    RAISE EXCEPTION 'role_not_permitted' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'subscriber' AND p_subscriber_id <> v_subscriber_id THEN
    RAISE EXCEPTION 'out_of_scope' USING ERRCODE = 'P0003';
  END IF;

  -- Argument sanity
  IF jsonb_typeof(p_pension) <> 'array' THEN
    RAISE EXCEPTION 'p_pension must be a JSON array' USING ERRCODE = 'P0004';
  END IF;
  IF jsonb_typeof(p_insurance) <> 'array' THEN
    RAISE EXCEPTION 'p_insurance must be a JSON array' USING ERRCODE = 'P0004';
  END IF;

  -- Aggregate validation BEFORE we mutate. Sum-to-100 OR zero rows total
  -- (zero rows = "no nominees declared" — a legitimate intermediate state).
  SELECT COUNT(*), COALESCE(SUM((n->>'share')::numeric), 0)
    INTO v_pension_count, v_pension_sum
    FROM jsonb_array_elements(p_pension) n;

  SELECT COUNT(*), COALESCE(SUM((n->>'share')::numeric), 0)
    INTO v_insurance_count, v_insurance_sum
    FROM jsonb_array_elements(p_insurance) n;

  -- Allow either: empty array OR sum exactly 100 (tolerance 0.01 for float
  -- round-trip). Other states are rejected — including sum=99 / sum=101.
  IF v_pension_count > 0 AND ABS(v_pension_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'pension_share_sum_must_equal_100 (got %)', v_pension_sum
      USING ERRCODE = 'P0005';
  END IF;
  IF v_insurance_count > 0 AND ABS(v_insurance_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'insurance_share_sum_must_equal_100 (got %)', v_insurance_sum
      USING ERRCODE = 'P0005';
  END IF;

  -- DELETE existing nominees for this subscriber.
  DELETE FROM public.nominees WHERE subscriber_id = p_subscriber_id;

  -- INSERT pension nominees.
  IF v_pension_count > 0 THEN
    INSERT INTO public.nominees (id, subscriber_id, type, name, phone, relationship, nin, share)
    SELECT
      COALESCE(n->>'id', 'nom-' || p_subscriber_id || '-p-' || v_base_ts || '-' || (idx::TEXT)),
      p_subscriber_id,
      'pension',
      n->>'name',
      n->>'phone',
      n->>'relationship',
      n->>'nin',
      (n->>'share')::numeric
    FROM jsonb_array_elements(p_pension) WITH ORDINALITY t(n, idx);
  END IF;

  -- INSERT insurance nominees.
  IF v_insurance_count > 0 THEN
    INSERT INTO public.nominees (id, subscriber_id, type, name, phone, relationship, nin, share)
    SELECT
      COALESCE(n->>'id', 'nom-' || p_subscriber_id || '-i-' || v_base_ts || '-' || (idx::TEXT)),
      p_subscriber_id,
      'insurance',
      n->>'name',
      n->>'phone',
      n->>'relationship',
      n->>'nin',
      (n->>'share')::numeric
    FROM jsonb_array_elements(p_insurance) WITH ORDINALITY t(n, idx);
  END IF;

  -- Return the canonical shape (matches getSubscriberNominees consumer).
  RETURN jsonb_build_object(
    'pension',   COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'phone', phone, 'relationship', relationship,
        'nin', nin, 'share', share
      ) ORDER BY id) FROM public.nominees
        WHERE subscriber_id = p_subscriber_id AND type = 'pension'
    ), '[]'::jsonb),
    'insurance', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'phone', phone, 'relationship', relationship,
        'nin', nin, 'share', share
      ) ORDER BY id) FROM public.nominees
        WHERE subscriber_id = p_subscriber_id AND type = 'insurance'
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) FROM anon;

COMMENT ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) IS
  'AUDIT-2-3 / AUDIT-4-6 fix — atomic nominees upsert with sum-to-100 invariant. Replaces the direct .delete + .insert pattern in services/subscriber.js. SECURITY DEFINER + role gate; subscribers can only update their own row.';
