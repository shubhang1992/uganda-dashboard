// Commission settings — network cadence + per-subscriber rate.
//
// Extracted from `src/services/commissions.js`. These four functions read/write
// the singleton `commission_config` row (id='default'); they are the only
// commission endpoints that touch the `commission_config` table directly,
// which makes them a clean bucket to isolate. State-machine mutations remain
// in `commissions.js`.
//
// The mock-fallback branches (`!IS_SUPABASE_ENABLED`) mutate the in-memory
// `COMMISSION_CONFIG` from `mockData.js` — intentional for demo rollback (see
// the `Rollback strategy` note at the top of `commissions.js`).
//
// `commissions.js` re-exports these four names so the hook layer
// (`useCommission.js`) sees no API change.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import { COMMISSION_CONFIG, MOCK_NOW } from '../data/mockData';
import { nextCycleEnd } from '../utils/settlementCycle';
import { VALID_CADENCES, fmtDate, _rpcError } from './_lib/commission-mappers';

/**
 * @endpoint GET commission_config (table)
 * @returns {Promise<{cadence: string, nextRunDate: string}>}
 * @cache ['networkCadence']
 */
export async function getNetworkCadence() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getNetworkCadence();
  const { data, error } = await supabase
    .from('commission_config')
    .select('cadence, next_run_date')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw _rpcError(error, 'getNetworkCadence');
  return {
    cadence: data?.cadence ?? 'monthly-first',
    nextRunDate: data?.next_run_date ?? null,
  };
}

/**
 * @endpoint PUT commission_config (table)
 * @scope Distributor only — RLS allows distributor UPDATE on commission_config.
 */
export async function setNetworkCadence(cadence) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_setNetworkCadence(cadence);
  if (!VALID_CADENCES.has(cadence)) {
    throw new Error(`Invalid cadence: ${cadence}`);
  }
  const nextRunDate = fmtDate(nextCycleEnd(cadence, new Date()));
  const { data, error } = await supabase
    .from('commission_config')
    .update({ cadence, next_run_date: nextRunDate, updated_at: new Date().toISOString() })
    .eq('id', 'default')
    .select('cadence, next_run_date')
    .maybeSingle();
  if (error) throw _rpcError(error, 'setNetworkCadence');
  return {
    cadence: data?.cadence ?? cadence,
    nextRunDate: data?.next_run_date ?? nextRunDate,
  };
}

/**
 * @endpoint GET commission_config.rate
 * @cache ['commissionRate']
 */
export async function getCommissionRate() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getCommissionRate();
  const { data, error } = await supabase
    .from('commission_config')
    .select('rate')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw _rpcError(error, 'getCommissionRate');
  return data?.rate != null ? Number(data.rate) : 0;
}

/**
 * @endpoint PUT commission_config.rate
 * @scope Distributor only.
 */
export async function setCommissionRate(amount) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_setCommissionRate(amount);
  const { data, error } = await supabase
    .from('commission_config')
    .update({ rate: amount, updated_at: new Date().toISOString() })
    .eq('id', 'default')
    .select('rate')
    .maybeSingle();
  if (error) throw _rpcError(error, 'setCommissionRate');
  return data?.rate != null ? Number(data.rate) : amount;
}

/* ─── Legacy mock fallbacks (preserved verbatim from commissions.js) ─────── */

function _legacy_mock_getNetworkCadence() {
  return Promise.resolve({
    cadence: COMMISSION_CONFIG.cadence,
    nextRunDate: COMMISSION_CONFIG.nextRunDate,
  });
}

function _legacy_mock_setNetworkCadence(cadence) {
  if (!VALID_CADENCES.has(cadence)) {
    return Promise.reject(new Error(`Invalid cadence: ${cadence}`));
  }
  COMMISSION_CONFIG.cadence = cadence;
  COMMISSION_CONFIG.nextRunDate = fmtDate(nextCycleEnd(cadence, MOCK_NOW));
  return _legacy_mock_getNetworkCadence();
}

function _legacy_mock_getCommissionRate() {
  return Promise.resolve(COMMISSION_CONFIG.ratePerSubscriber);
}

function _legacy_mock_setCommissionRate(amount) {
  COMMISSION_CONFIG.ratePerSubscriber = amount;
  return Promise.resolve(amount);
}
