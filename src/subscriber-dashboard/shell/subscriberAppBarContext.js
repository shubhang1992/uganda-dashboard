import { createContext, useContext } from 'react';

/**
 * Lets a routed page override the mobile app bar's back button with its own
 * handler — e.g. a multi-step flow (ClaimPage list→form→review→success) that
 * must step back through internal views BEFORE leaving the route. The app bar
 * reads `backRef.current` at click time; a page registers via
 * `registerBack(fn)` inside an effect, and the returned cleanup clears it on
 * unmount. When nothing is registered the app bar falls back to navigate(-1).
 */
export const SubscriberAppBarContext = createContext({
  backRef: { current: null },
  registerBack: () => () => {},
});

export function useSubscriberAppBar() {
  return useContext(SubscriberAppBarContext);
}
