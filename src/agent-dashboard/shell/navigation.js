// Re-export shared navigation helpers from src/utils/navigation.js.
// Kept here for parity with subscriber-dashboard so agent pages can
// use the `../shell/navigation` import path if needed.
export { goBackOrFallback } from '../../utils/navigation';
