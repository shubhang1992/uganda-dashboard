import { createContext, useContext, useState, useMemo } from 'react';
import { SCOPES } from '../constants/scopes';

/**
 * Data-scope context for the Admin dashboard's "Platform Overview" filter
 * (All data / Distributors / Employers). The admin shell mounts this so BOTH the
 * country Summary card (`AdminCountryOverview`) and the shared map drill-down
 * (`OverlayPanel`) read the same scope.
 *
 * DISTRIBUTOR-ISOLATION GUARANTEE: the provider is mounted ONLY in the admin
 * shell. `useDataScope()` returns a safe default (`scope: 'distributors'`,
 * `employerAware: false`) when no provider is present, so the shared OverlayPanel
 * renders byte-for-byte as today for the distributor role and fires ZERO
 * employer-only queries. `employerAware` is true only under a provider (admin) —
 * it gates the admin-only employer geo rollup and the district "Employers" tab.
 *
 * @typedef {Object} DataScopeValue
 * @property {'all'|'distributors'|'employers'} scope
 * @property {(scope: string) => void} setScope
 * @property {boolean} employerAware  true under a provider (admin); false otherwise.
 */

const DataScopeContext = createContext(null);

export function DataScopeProvider({ children, defaultScope = SCOPES.ALL }) {
  const [scope, setScope] = useState(defaultScope);
  const value = useMemo(() => ({ scope, setScope, employerAware: true }), [scope]);
  return <DataScopeContext value={value}>{children}</DataScopeContext>;
}

/**
 * Read the current data scope. Outside a provider (distributor/branch/etc.) this
 * returns a frozen distributor-only default so non-admin roles behave exactly as
 * before and never trigger employer queries.
 * @returns {DataScopeValue}
 */
export function useDataScope() {
  const ctx = useContext(DataScopeContext);
  return ctx ?? { scope: SCOPES.DISTRIBUTORS, setScope: () => {}, employerAware: false };
}
