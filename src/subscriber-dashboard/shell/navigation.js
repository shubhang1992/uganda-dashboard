/**
 * Walk back one entry in the browser history if there's an in-app entry to
 * pop, otherwise navigate to a fallback path. Use for "back" buttons that
 * should respect the user's actual navigation path (e.g. Settings → Profile
 * → back must return to Settings, not to /dashboard).
 *
 * Detection: react-router stores its own index on `window.history.state.idx`.
 * Index 0 means the user landed here directly (deep link, refresh, or fresh
 * tab) — there's nothing useful to pop, so we go to the fallback.
 *
 * @param {ReturnType<import('react-router-dom').useNavigate>} navigate
 * @param {string} fallback - Route to navigate to when history is empty
 */
export function goBackOrFallback(navigate, fallback) {
  const idx = window.history.state?.idx;
  if (typeof idx === 'number' && idx > 0) {
    navigate(-1);
  } else {
    navigate(fallback);
  }
}
