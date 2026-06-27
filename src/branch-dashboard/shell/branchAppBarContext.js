import { createContext, useContext } from 'react';

/**
 * Context for the branch mobile app bar. Two responsibilities (mirrors
 * agentAppBarContext):
 *
 * 1. Back override — lets a routed page replace the app bar's back button with
 *    its own handler (e.g. a multi-step flow that steps back through internal
 *    views BEFORE leaving the route). The app bar reads `backRef.current` at
 *    click time; a page registers via `registerBack(fn)` inside an effect, and
 *    the returned cleanup clears it on unmount. When nothing is registered the
 *    app bar falls back to navigate(-1).
 *
 * 2. openAskAI — lets a page (e.g. a Branch Copilot tile) open the Ask AI bottom
 *    sheet owned by the shell, without prop-drilling the sheet state.
 */
export const BranchAppBarContext = createContext({
  backRef: { current: null },
  registerBack: () => () => {},
  openAskAI: () => {},
});

export function useBranchAppBar() {
  return useContext(BranchAppBarContext);
}
