import { createContext, useContext } from 'react';

/**
 * Context for the employer mobile app bar. Three responsibilities:
 *
 * 1. Back override — lets a routed page replace the app bar's back button with
 *    its own handler. Employer Runs / Support / Onboard keep their detail / wizard
 *    / thread / review steps as IN-PAGE views (matching the desktop pages), so the
 *    persistent back must step through those internal views BEFORE leaving the
 *    route. A page calls `registerBack(fn, title?)` inside an effect; the app bar
 *    then shows a back button (even on a primary tab) and, while registered,
 *    swaps its title for the optional `title` override. The returned cleanup
 *    clears it on unmount / view change. When nothing is registered the back
 *    button only shows on pages whose static meta says so, falling back to
 *    navigate(-1).
 *
 * 2. backActive / backTitle — the reactive flags the app bar reads to decide
 *    whether to render the back button and which title to show (a ref alone
 *    wouldn't re-render the bar on registration).
 *
 * 3. openAskAI — lets a page (e.g. ProfileMobile's Co-Pilot tile) open the Ask-AI
 *    bottom sheet owned by the shell, without prop-drilling the sheet state.
 */
export const EmployerAppBarContext = createContext({
  backRef: { current: null },
  registerBack: () => () => {},
  backActive: false,
  backTitle: null,
  openAskAI: () => {},
});

export function useEmployerAppBar() {
  return useContext(EmployerAppBarContext);
}
