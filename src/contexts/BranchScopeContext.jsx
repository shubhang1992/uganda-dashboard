import { createContext, useContext } from 'react';

// Provides a branch ID to descendants when the dashboard is rendered for a
// Branch Admin. Distributor Admin trees do not wrap with this provider, so
// `useBranchScope().branchId` is null and components fall back to network-wide
// data. Lets deeply nested, lazy-loaded report views read scope without
// having to thread props through every layer.
const BranchScopeContext = createContext({ branchId: null });

export function BranchScopeProvider({ branchId, children }) {
  return (
    <BranchScopeContext value={{ branchId: branchId || null }}>
      {children}
    </BranchScopeContext>
  );
}

export function useBranchScope() {
  return useContext(BranchScopeContext);
}
