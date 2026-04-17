import { useSyncExternalStore } from 'react';

const MQ = '(max-width: 768px)';

function subscribeMQ(cb) {
  const mql = window.matchMedia(MQ);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getIsMobile() {
  return window.matchMedia(MQ).matches;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribeMQ, getIsMobile);
}
