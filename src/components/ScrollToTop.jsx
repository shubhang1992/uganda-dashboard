import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

// React Router 7's declarative <Routes> doesn't restore scroll on its own.
// Reset window scroll on every pathname change. No-op for the dashboard
// shells (they're position:fixed and scroll their own inner viewport).
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
