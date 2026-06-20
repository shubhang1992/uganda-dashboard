/* Service-worker registration for the installable PWA.
 *
 * Prod-only by design: in dev (and under Vitest) we never register, so HMR,
 * the Vite dev server, and tests are completely unaffected. On a new build the
 * worker self-activates (SKIP_WAITING) and the page reloads once to pick it up.
 */
export function registerSW() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // A new worker has installed alongside the active one → activate it now.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(() => {
        /* registration failures are non-fatal — the app still works online */
      });
  });

  // When the freshly-activated worker takes control, reload once to serve the
  // new build. Guarded so we never loop.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
