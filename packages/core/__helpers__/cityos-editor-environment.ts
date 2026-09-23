import { ResizeObserver } from "@juggle/resize-observer";

/**
 * Load before Puck/DnD imports. jsdom lacks layout/visibility APIs; these tests
 * exercise real field controls, not drag geometry or browser visibility proof.
 * Use the installed resize polyfill and a stationary intersection fixture.
 */
Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserver,
  configurable: true,
});
class FixtureIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = () => [];
}
Object.defineProperty(globalThis, "IntersectionObserver", {
  value: FixtureIntersectionObserver,
  configurable: true,
});
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});
