import { createContext, useContext } from 'react';

/**
 * Context for the agent mobile app bar. Two responsibilities:
 *
 * 1. Back override — lets a routed page replace the app bar's back button with
 *    its own handler (e.g. a multi-step flow that must step back through internal
 *    views BEFORE leaving the route). The app bar reads `backRef.current` at click
 *    time; a page registers via `registerBack(fn)` inside an effect, and the
 *    returned cleanup clears it on unmount. When nothing is registered the app bar
 *    falls back to navigate(-1).
 *
 * 2. openAskAI — lets a page (e.g. ProfilePage's Co-Pilot tile) open the Ask AI
 *    bottom sheet owned by the shell, without prop-drilling the sheet state.
 */
export const AgentAppBarContext = createContext({
  backRef: { current: null },
  registerBack: () => () => {},
  openAskAI: () => {},
});

export function useAgentAppBar() {
  return useContext(AgentAppBarContext);
}
