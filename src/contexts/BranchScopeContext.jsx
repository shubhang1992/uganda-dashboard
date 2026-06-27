import { createScopeContext } from './createScopeContext';

// Provides a branch ID to descendants when the dashboard is rendered for a
// Branch Admin. Distributor Admin trees do not wrap with this provider, so
// `useBranchScope().branchId` is null and components fall back to network-wide
// data. Lets deeply nested, lazy-loaded report views read scope without
// having to thread props through every layer.
const { ScopeProvider, useScope } = createScopeContext('branchId');

export const BranchScopeProvider = ScopeProvider;
export const useBranchScope = useScope;
