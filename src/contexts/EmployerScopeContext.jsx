import { createScopeContext } from './createScopeContext';

// Provides an employer ID to descendants when the dashboard is rendered for an
// Employer. Lets deeply nested, lazy-loaded panels/report views read scope
// without having to thread props through every layer.
const { ScopeProvider, useScope } = createScopeContext('employerId');

export const EmployerScopeProvider = ScopeProvider;
export const useEmployerScope = useScope;
