import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}

const echartsInstances = new Map<HTMLElement, any>();

vi.mock('echarts', () => {
  return {
    init: vi.fn((dom: HTMLElement) => {
      const instance = {
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(() => echartsInstances.delete(dom))
      };
      echartsInstances.set(dom, instance);
      return instance;
    }),
    getInstanceByDom: vi.fn((dom: HTMLElement) => echartsInstances.get(dom) ?? null)
  };
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

window.scrollTo = vi.fn();

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}

if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = vi.fn();
}
