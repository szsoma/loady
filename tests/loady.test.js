import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function setupDOM(loaderHTML) {
  document.body.innerHTML = loaderHTML;
}

var _dclFns = [];
var _clickFns = [];

function loadScript() {
  vi.resetModules();
  _dclFns.forEach(function (fn) { document.removeEventListener('DOMContentLoaded', fn); });
  _dclFns = [];
  _clickFns.forEach(function (fn) { document.removeEventListener('click', fn); });
  _clickFns = [];

  var origAdd = document.addEventListener;
  document.addEventListener = function (type, fn, opts) {
    if (type === 'DOMContentLoaded') _dclFns.push(fn);
    if (type === 'click') _clickFns.push(fn);
    return origAdd.call(document, type, fn, opts);
  };

  return import('../src/loady.js').then(function (mod) {
    document.addEventListener = origAdd;
    return mod;
  });
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

describe('URL bypass (?noloader=true)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('skips loader and dispatches pageLoady:finished when ?noloader=true', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?noloader=true' },
    });

    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');

    let eventFired = false;
    window.addEventListener('pageLoady:finished', () => { eventFired = true; });

    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBeNull();
    expect(document.querySelector('[data-loady="container"]').style.display).toBe('none');
    expect(eventFired).toBe(true);
  });

  it('runs loader normally when ?noloader is absent', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '' },
    });

    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });
});

describe('Run-once (data-loady-once)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plays loader on first visit and sets sessionStorage flag', async () => {
    setupDOM('<div data-loady="container" data-loady-once="true"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
    expect(sessionStorage.getItem('loady:seen')).toBe('true');
  });

  it('skips loader on second visit when sessionStorage flag exists', async () => {
    sessionStorage.setItem('loady:seen', 'true');
    setupDOM('<div data-loady="container" data-loady-once="true"><span data-loady-counter>0%</span></div>');

    let eventFired = false;
    window.addEventListener('pageLoady:finished', () => { eventFired = true; });

    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBeNull();
    expect(eventFired).toBe(true);
  });

  it('ignores run-once when attribute is not set', async () => {
    sessionStorage.setItem('loady:seen', 'true');
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });
});

describe('Debug mode (data-loady-debug)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs debug info to console when data-loady-debug="true"', async () => {
    setupDOM('<div data-loady="container" data-loady-debug="true" data-loady-anim="slide-up"><span data-loady-counter>0%</span></div>');

    var groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    var tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    var groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 100));

    expect(groupSpy).toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalled();
    var tableArg = tableSpy.mock.calls[0][0];
    expect(tableArg['Trigger Source']).toBeDefined();
    expect(tableArg['Animation Type']).toBe('slide-up');
    expect(groupEndSpy).toHaveBeenCalled();
  });

  it('does not log when data-loady-debug is absent', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');

    var groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    var tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 100));

    expect(groupSpy).not.toHaveBeenCalled();
    expect(tableSpy).not.toHaveBeenCalled();
  });
});
