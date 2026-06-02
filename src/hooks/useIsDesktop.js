import { useSyncExternalStore } from 'react';

const MQ = '(min-width: 1024px)';

function subscribeMQ(cb) {
  const mql = window.matchMedia(MQ);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getIsDesktop() {
  return window.matchMedia(MQ).matches;
}

export function useIsDesktop() {
  return useSyncExternalStore(subscribeMQ, getIsDesktop);
}
