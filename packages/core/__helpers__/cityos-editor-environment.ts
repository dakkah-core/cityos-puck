import { ResizeObserver } from "@juggle/resize-observer";

/**
 * Load before Puck/DnD imports. jsdom lacks these browser APIs; component tests
 * are not browser layout or device-mode evidence. No editor behavior is mocked.
 */
Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserver,
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
