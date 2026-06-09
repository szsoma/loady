import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function setupDOM(loaderHTML) {
  document.body.innerHTML = loaderHTML;
}

function loadScript() {
  vi.resetModules();
  return import('../src/loady.js');
}

function fireDOMContentLoaded() {
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

function fireLoad() {
  window.dispatchEvent(new Event('load'));
}

describe('Loady smoke test', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when no loader element exists', async () => {
    setupDOM('<div>No loader here</div>');
    await loadScript();
    fireDOMContentLoaded();
    expect(document.body.getAttribute('data-loady-status')).toBeNull();
  });

  it('sets loading state on body when loader exists', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();
    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
    expect(document.body.getAttribute('aria-busy')).toBe('true');
  });
});
