import '@testing-library/jest-dom';

// JSDOM has no window.matchMedia, but useIsDesktop() (and any other matchMedia
// consumer) calls it during render. Stub it to a non-matching media query so
// component tests deterministically render their mobile / <1024px branch.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
