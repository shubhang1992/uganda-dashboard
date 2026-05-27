// Re-export shared navigation helpers from src/utils/navigation.js.
// Kept here so subscriber-dashboard pages can continue using the
// `../shell/navigation` import path; implementation lives in src/utils.
export { goBackOrFallback } from '../../utils/navigation';
