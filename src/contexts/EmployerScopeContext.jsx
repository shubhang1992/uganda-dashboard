import { createContext, useContext, useMemo } from 'react';

// Provides an employer ID to descendants when the dashboard is rendered for an
// Employer. Lets deeply nested, lazy-loaded panels/report views read scope
// without having to thread props through every layer. Verbatim clone of
// BranchScopeContext (branch → employer).
const EmployerScopeContext = createContext({ employerId: null });

export function EmployerScopeProvider({ employerId, children }) {
  const value = useMemo(() => ({ employerId: employerId || null }), [employerId]);

  return (
    <EmployerScopeContext value={value}>
      {children}
    </EmployerScopeContext>
  );
}

export function useEmployerScope() {
  return useContext(EmployerScopeContext);
}
