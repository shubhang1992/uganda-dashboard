/**
 * Admin "Platform Overview" data-scope values. Kept here (not in DataScopeContext)
 * so that context file only exports components/hooks — preserving React Fast Refresh
 * (same reason `constants/levels.js` is split out).
 */
export const SCOPES = { ALL: 'all', DISTRIBUTORS: 'distributors', EMPLOYERS: 'employers' };
