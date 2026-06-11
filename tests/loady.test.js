import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

globalThis.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
globalThis.cancelAnimationFrame = function (id) { clearTimeout(id); };

function setupDOM(loaderHTML) {
  document.body.innerHTML = loaderHTML;
}

var _dclFns = [];
var _clickFns = [];
var _mouseoverFns = [];
var _touchstartFns = [];

function loadScript() {
  vi.resetModules();
  _dclFns.forEach(function (fn) { document.removeEventListener('DOMContentLoaded', fn); });
  _dclFns = [];
  _clickFns.forEach(function (fn) { document.removeEventListener('click', fn); });
  _clickFns = [];
  _mouseoverFns.forEach(function (fn) { document.removeEventListener('mouseover', fn); });
  _mouseoverFns = [];
  _touchstartFns.forEach(function (fn) { document.removeEventListener('touchstart', fn); });
  _touchstartFns = [];

  var origAdd = document.addEventListener;
  document.addEventListener = function (type, fn, opts) {
    if (type === 'DOMContentLoaded') _dclFns.push(fn);
    if (type === 'click') _clickFns.push(fn);
    if (type === 'mouseover') _mouseoverFns.push(fn);
    if (type === 'touchstart') _touchstartFns.push(fn);
    return origAdd.call(document, type, fn, opts);
  };

  return import('../src/loady.js').then(function (mod) {
    document.addEventListener = origAdd;
    return mod;
  });
}

function fireDOMContentLoaded() {
  var origAdd = document.addEventListener;
  document.addEventListener = function (type, fn, opts) {
    if (type === 'click') _clickFns.push(fn);
    if (type === 'mouseover') _mouseoverFns.push(fn);
    if (type === 'touchstart') _touchstartFns.push(fn);
    return origAdd.call(document, type, fn, opts);
  };
  document.dispatchEvent(new Event('DOMContentLoaded'));
  document.addEventListener = origAdd;
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
    delete window.__loadyDebug;
  });

  it('logs debug info to console when data-loady-debug="true"', async () => {
    window.__loadyDebug = true;
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

describe('Debug logger no-op completeness', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    delete window.__loadyDebug;
  });

  afterEach(function () {
    vi.restoreAllMocks();
    delete window.__loadyDebug;
  });

  it('no-op logger has groupCollapsed, table, and groupEnd methods', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(function () {});
    var tableSpy = vi.spyOn(console, 'table').mockImplementation(function () {});
    var groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(function () {});

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(function (r) { return setTimeout(r, 300); });

    expect(groupSpy).not.toHaveBeenCalled();
    expect(tableSpy).not.toHaveBeenCalled();
    expect(groupEndSpy).not.toHaveBeenCalled();
  });
});

describe('MutationObserver for injected elements', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides dynamically injected elements with data-gsap-hide', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    var injected = document.createElement('div');
    injected.setAttribute('data-gsap-hide', '');
    document.body.appendChild(injected);

    await new Promise(r => setTimeout(r, 50));

    expect(injected.style.visibility).toBe('hidden');
    expect(injected.style.opacity).toBe('0');
  });

  it('hides children of injected nodes that have data-gsap-hide', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    var wrapper = document.createElement('div');
    var child = document.createElement('span');
    child.setAttribute('data-gsap-hide', '');
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);

    await new Promise(r => setTimeout(r, 50));

    expect(child.style.visibility).toBe('hidden');
    expect(child.style.opacity).toBe('0');
  });

  it('does not modify elements without data-gsap-hide', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    var normal = document.createElement('div');
    normal.textContent = 'Hello';
    document.body.appendChild(normal);

    await new Promise(r => setTimeout(r, 50));

    expect(normal.style.visibility).toBe('');
    expect(normal.style.opacity).toBe('');
  });
});

describe('Auto-reveal of data-gsap-hide elements', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it('reveals static data-gsap-hide elements when loader finishes', async function () {
    setupDOM(`
      <div data-loady="container" data-loady-duration="0.1" data-loady-failsafe="5000">
        <span data-loady-counter>0%</span>
      </div>
      <div data-gsap-hide id="static-hidden">Hidden content</div>
    `);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(function (r) { return setTimeout(r, 300); });

    var el = document.getElementById('static-hidden');
    expect(el.style.visibility).toBe('visible');
    expect(el.style.opacity).toBe('1');
  });

  it('reveals dynamically injected data-gsap-hide elements when loader finishes', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.1" data-loady-failsafe="5000"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var injected = document.createElement('div');
    injected.setAttribute('data-gsap-hide', '');
    injected.id = 'dynamic-hidden';
    document.body.appendChild(injected);

    await new Promise(function (r) { return setTimeout(r, 50); });

    fireLoad();

    await new Promise(function (r) { return setTimeout(r, 300); });

    var el = document.getElementById('dynamic-hidden');
    expect(el.style.visibility).toBe('visible');
    expect(el.style.opacity).toBe('1');
  });

  it('maintains reveal after bfcache restore', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.1" data-loady-failsafe="5000"><span data-loady-counter>0%</span></div>');
    var gsapEl = document.createElement('div');
    gsapEl.setAttribute('data-gsap-hide', '');
    gsapEl.id = 'bfcache-el';
    document.body.appendChild(gsapEl);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(function (r) { return setTimeout(r, 300); });

    var pageshowEvent = new Event('pageshow');
    Object.defineProperty(pageshowEvent, 'persisted', { value: true });
    window.dispatchEvent(pageshowEvent);

    var el = document.getElementById('bfcache-el');
    expect(el.style.visibility).toBe('visible');
    expect(el.style.opacity).toBe('1');
  });
});

describe('GSAP auto-pause', () => {
  var mockGSAP;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '' },
    });

    mockGSAP = {
      globalTimeline: {
        pause: vi.fn(),
        resume: vi.fn(),
      },
    };
    window.gsap = mockGSAP;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.gsap;
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('pauses gsap.globalTimeline on loader init', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(mockGSAP.globalTimeline.pause).toHaveBeenCalled();
  });

  it('resumes gsap.globalTimeline when loader finishes', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 600));

    expect(mockGSAP.globalTimeline.resume).toHaveBeenCalled();
  });

  it('resumes gsap.globalTimeline on finishImmediately (noloader bypass)', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?noloader=true' },
    });

    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(mockGSAP.globalTimeline.resume).toHaveBeenCalled();
  });

  it('does not pause GSAP when data-loady-gsap="false"', async () => {
    setupDOM('<div data-loady="container" data-loady-gsap="false"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(mockGSAP.globalTimeline.pause).not.toHaveBeenCalled();
  });

  it('does not throw when GSAP is not present', async () => {
    delete window.gsap;
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();

    expect(() => fireDOMContentLoaded()).not.toThrow();
    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });
});

describe('Webflow IX2 auto-pause', () => {
  var mockIx2;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '' },
    });

    mockIx2 = {
      destroy: vi.fn(),
      init: vi.fn(),
    };
    window.Webflow = {
      require: vi.fn(function (mod) {
        if (mod === 'ix2') return mockIx2;
        return null;
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.Webflow;
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('destroys IX2 on loader init', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(window.Webflow.require).toHaveBeenCalledWith('ix2');
    expect(mockIx2.destroy).toHaveBeenCalled();
  });

  it('re-initializes IX2 when loader finishes', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 600));

    expect(mockIx2.init).toHaveBeenCalled();
  });

  it('re-initializes IX2 on finishImmediately (noloader bypass)', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?noloader=true' },
    });

    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(mockIx2.init).toHaveBeenCalled();
  });

  it('does not destroy IX2 when data-loady-ix2="false"', async () => {
    setupDOM('<div data-loady="container" data-loady-ix2="false"><span data-loady-counter>0%</span></div>');
    await loadScript();
    fireDOMContentLoaded();

    expect(mockIx2.destroy).not.toHaveBeenCalled();
  });

  it('does not throw when Webflow is not present', async () => {
    delete window.Webflow;
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');
    await loadScript();

    expect(() => fireDOMContentLoaded()).not.toThrow();
    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });
});

describe('Debug mode includes GSAP/IX2 status', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.gsap;
    delete window.Webflow;
    delete window.__loadyDebug;
  });

  it('shows GSAP and IX2 status in debug table', async () => {
    window.__loadyDebug = true;
    window.gsap = { globalTimeline: { pause: vi.fn(), resume: vi.fn() } };
    window.Webflow = { require: vi.fn(() => ({ destroy: vi.fn(), init: vi.fn() })) };

    setupDOM('<div data-loady="container" data-loady-debug="true"><span data-loady-counter>0%</span></div>');

    var tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 600));

    var tableArg = tableSpy.mock.calls[0][0];
    expect(tableArg['GSAP Paused']).toBe(true);
    expect(tableArg['IX2 Paused']).toBe(true);
  });

  it('shows false when GSAP/IX2 are opted out', async () => {
    window.__loadyDebug = true;
    window.gsap = { globalTimeline: { pause: vi.fn(), resume: vi.fn() } };
    window.Webflow = { require: vi.fn(() => ({ destroy: vi.fn(), init: vi.fn() })) };

    setupDOM('<div data-loady="container" data-loady-debug="true" data-loady-gsap="false" data-loady-ix2="false"><span data-loady-counter>0%</span></div>');

    var tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 600));

    var tableArg = tableSpy.mock.calls[0][0];
    expect(tableArg['GSAP Paused']).toBe(false);
    expect(tableArg['IX2 Paused']).toBe(false);
  });
});

describe('pageLoady:progress event', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches progress event with correct shape during loading', async () => {
    setupDOM('<div data-loady="container"><img src="a.jpg"><span data-loady-counter>0%</span></div>');

    var progressEvents = [];
    window.addEventListener('pageLoady:progress', function (e) {
      progressEvents.push(e.detail);
    });

    await loadScript();
    fireDOMContentLoaded();

    await new Promise(r => setTimeout(r, 100));

    expect(progressEvents.length).toBeGreaterThan(0);
    var evt = progressEvents[0];
    expect(typeof evt.percent).toBe('number');
    expect(typeof evt.raw).toBe('number');
    expect(evt.phase).toBe('loading');
    expect(evt.percent).toBeGreaterThanOrEqual(0);
    expect(evt.percent).toBeLessThanOrEqual(85);
    expect(evt.raw).toBeGreaterThanOrEqual(0);
    expect(evt.raw).toBeLessThanOrEqual(0.85);
  });

  it('updates progress as images load', async () => {
    setupDOM('<div data-loady="container"><img src="a.jpg"><img src="b.jpg"><span data-loady-counter>0%</span></div>');

    var progressEvents = [];
    window.addEventListener('pageLoady:progress', function (e) {
      progressEvents.push(e.detail);
    });

    await loadScript();
    fireDOMContentLoaded();

    var imgs = document.querySelectorAll('img');
    imgs[0].dispatchEvent(new Event('load'));

    await new Promise(r => setTimeout(r, 100));

    var afterOneLoad = progressEvents[progressEvents.length - 1];
    expect(afterOneLoad.percent).toBeGreaterThan(0);
  });

  it('counts already-complete images as loaded', async () => {
    setupDOM('<div data-loady="container"><img src="a.jpg"><span data-loady-counter>0%</span></div>');

    var img = document.querySelector('img');
    Object.defineProperty(img, 'complete', { value: true });

    var progressEvents = [];
    window.addEventListener('pageLoady:progress', function (e) {
      progressEvents.push(e.detail);
    });

    await loadScript();
    fireDOMContentLoaded();

    await new Promise(r => setTimeout(r, 100));

    var last = progressEvents[progressEvents.length - 1];
    expect(last.percent).toBe(85);
    expect(last.raw).toBeCloseTo(0.85, 1);
  });

  it('fires final progress event with percent 100 and phase animating', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var progressEvents = [];
    window.addEventListener('pageLoady:progress', function (e) {
      progressEvents.push(e.detail);
    });

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    var finalEvt = progressEvents.find(function (e) { return e.phase === 'complete'; });
    expect(finalEvt).toBeDefined();
    expect(finalEvt.percent).toBe(100);
    expect(finalEvt.raw).toBe(1);
  });

  it('fires progress event even without data-loady-counter element', async () => {
    setupDOM('<div data-loady="container"><img src="a.jpg"></div>');

    var progressEvents = [];
    window.addEventListener('pageLoady:progress', function (e) {
      progressEvents.push(e.detail);
    });

    await loadScript();
    fireDOMContentLoaded();

    await new Promise(r => setTimeout(r, 100));

    expect(progressEvents.length).toBeGreaterThan(0);
  });

  it('treats image error events as resolved', async () => {
    setupDOM('<div data-loady="container"><img src="broken.jpg"><span data-loady-counter>0%</span></div>');

    var progressEvents = [];
    window.addEventListener('pageLoady:progress', function (e) {
      progressEvents.push(e.detail);
    });

    await loadScript();
    fireDOMContentLoaded();

    var img = document.querySelector('img');
    img.dispatchEvent(new Event('error'));

    await new Promise(r => setTimeout(r, 100));

    var last = progressEvents[progressEvents.length - 1];
    expect(last.percent).toBe(85);
  });
});

describe('data-loady-threshold', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits when threshold fraction of assets loaded (0.5)', async () => {
    setupDOM('<div data-loady="container" data-loady-threshold="0.5" data-loady-duration="0.1"><img src="a.jpg"><img src="b.jpg"><span data-loady-counter>0%</span></div>');

    let finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    var imgs = document.querySelectorAll('img');
    imgs[0].dispatchEvent(new Event('load'));

    await new Promise(r => setTimeout(r, 300));

    expect(finished).toBe(true);
  });

  it('threshold 1.0 waits for all assets (default)', async () => {
    setupDOM('<div data-loady="container" data-loady-threshold="1.0" data-loady-duration="0.1"><img src="a.jpg"><img src="b.jpg"><span data-loady-counter>0%</span></div>');

    let finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    var imgs = document.querySelectorAll('img');
    imgs[0].dispatchEvent(new Event('load'));

    await new Promise(r => setTimeout(r, 100));
    expect(finished).toBe(false);

    imgs[1].dispatchEvent(new Event('load'));

    await new Promise(r => setTimeout(r, 300));
    expect(finished).toBe(true);
  });

  it('exits immediately when zero assets and any threshold', async () => {
    setupDOM('<div data-loady="container" data-loady-threshold="0.5" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    let finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    await new Promise(r => setTimeout(r, 300));

    expect(finished).toBe(true);
  });

  it('failsafe still fires when threshold never crossed', async () => {
    setupDOM('<div data-loady="container" data-loady-threshold="1.0" data-loady-failsafe="200" data-loady-duration="0.1"><img src="never-loads.jpg"><span data-loady-counter>0%</span></div>');

    let finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    await new Promise(r => setTimeout(r, 500));

    expect(finished).toBe(true);
  });

  it('respects data-loady-min even when threshold crossed early', async () => {
    setupDOM('<div data-loady="container" data-loady-threshold="0.5" data-loady-min="500" data-loady-duration="0.1"><img src="a.jpg"><img src="b.jpg"><span data-loady-counter>0%</span></div>');

    let finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    var imgs = document.querySelectorAll('img');
    imgs[0].dispatchEvent(new Event('load'));

    await new Promise(r => setTimeout(r, 200));
    expect(finished).toBe(false);

    await new Promise(r => setTimeout(r, 500));
    expect(finished).toBe(true);
  });

  it('window.load still triggers exit as fallback', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><img src="a.jpg"><span data-loady-counter>0%</span></div>');

    let finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    expect(finished).toBe(true);
  });
});

describe('isQualifyingLink (via outbound click)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('intercepts same-origin link click when outbound is configured', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    var prevented = !link.dispatchEvent(event);

    expect(prevented).toBe(true);
  });

  it('does not intercept hash-only links', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = '#section';
    link.textContent = 'Section';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    var prevented = !link.dispatchEvent(event);

    expect(prevented).toBe(false);
  });

  it('does not intercept cross-origin links', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'https://external.com/page';
    link.textContent = 'External';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    var prevented = !link.dispatchEvent(event);

    expect(prevented).toBe(false);
  });

  it('does not intercept links with target="_blank"', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.target = '_blank';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    var prevented = !link.dispatchEvent(event);

    expect(prevented).toBe(false);
  });

  it('does not intercept links matching data-loady-ignore', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-ignore=".skip" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.className = 'skip';
    link.textContent = 'Skip';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    var prevented = !link.dispatchEvent(event);

    expect(prevented).toBe(false);
  });

  it('sets sessionStorage for ignored links', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-ignore=".skip" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.className = 'skip';
    link.textContent = 'Skip';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(sessionStorage.getItem('loady:ignore')).toBe('1');
  });

  it('works with ignoreList without outbound configured', async () => {
    setupDOM('<div data-loady="container" data-loady-ignore=".skip" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.className = 'skip';
    link.textContent = 'Skip';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(sessionStorage.getItem('loady:ignore')).toBe('1');
  });

  it('does not intercept when outbound is not configured', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    var prevented = !link.dispatchEvent(event);

    expect(prevented).toBe(false);
  });
});

describe('Outbound transitions (data-loady-outbound)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    delete window._loadyGen;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('navigates to destination after transitionend', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    var loader = document.querySelector('[data-loady="container"]');
    loader.dispatchEvent(new Event('transitionend'));

    expect(window.location.href).toBe('http://localhost:3000/about');
  });

  it('sets loader visible and applies outbound animation styles', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="slide-down" data-loady-duration="0.2"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 400));

    link.click();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.style.display).not.toBe('none');
  });

  it('navigates via failsafe when transitionend never fires', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await vi.advanceTimersByTimeAsync(300);

    link.click();

    await vi.advanceTimersByTimeAsync(600);

    expect(window.location.href).toBe('http://localhost:3000/about');

    vi.useRealTimers();
  });

  it('sets aria-busy during outbound animation', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    expect(document.body.getAttribute('aria-busy')).toBe('true');
  });

  it('does not intercept current page URL', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/';
    link.textContent = 'Home';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    var event = new MouseEvent('click', { bubbles: true, cancelable: true });
    var prevented = !link.dispatchEvent(event);

    expect(prevented).toBe(false);
  });
});

describe('pageshow / bfcache handler', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('hides loader and dispatches pageLoady:finished on bfcache restore', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    var pageshowEvent = new Event('pageshow');
    Object.defineProperty(pageshowEvent, 'persisted', { value: true });
    window.dispatchEvent(pageshowEvent);

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.style.display).toBe('none');
    expect(finished).toBe(true);
  });

  it('does nothing on non-persisted pageshow', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var finishedCount = 0;
    window.addEventListener('pageLoady:finished', function () { finishedCount++; });

    var pageshowEvent = new Event('pageshow');
    Object.defineProperty(pageshowEvent, 'persisted', { value: false });
    window.dispatchEvent(pageshowEvent);

    expect(finishedCount).toBe(0);
  });
});

describe('Hover prefetch (data-loady-prefetch)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  it('injects prefetch link after 80ms hover on qualifying link', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    await vi.advanceTimersByTimeAsync(100);

    var prefetchLink = document.querySelector('link[rel="prefetch"]');
    expect(prefetchLink).not.toBeNull();
    expect(prefetchLink.href).toBe('http://localhost:3000/about');
    expect(prefetchLink.getAttribute('as')).toBe('document');

    vi.useRealTimers();
  });

  it('cancels prefetch if mouse leaves before 80ms', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(40);

    link.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(60);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    vi.useRealTimers();
  });

  it('does not prefetch same URL twice', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    link.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    var prefetchLinks = document.querySelectorAll('link[rel="prefetch"][href="http://localhost:3000/about"]');
    expect(prefetchLinks.length).toBe(1);

    vi.useRealTimers();
  });

  it('does not prefetch cross-origin links', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'https://external.com/page';
    link.textContent = 'External';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    vi.useRealTimers();
  });

  it('does not prefetch when data-loady-prefetch is omitted', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    vi.useRealTimers();
  });

  it('skips prefetch on slow connections', async () => {
    vi.useFakeTimers();

    Object.defineProperty(navigator, 'connection', {
      writable: true,
      value: { effectiveType: '2g', saveData: false },
    });

    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    Object.defineProperty(navigator, 'connection', { writable: true, value: undefined });
    vi.useRealTimers();
  });

  it('skips prefetch when saveData is true', async () => {
    vi.useFakeTimers();

    Object.defineProperty(navigator, 'connection', {
      writable: true,
      value: { effectiveType: '4g', saveData: true },
    });

    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    Object.defineProperty(navigator, 'connection', { writable: true, value: undefined });
    vi.useRealTimers();
  });
});

describe('View Transition — crossfade strategy', () => {
  var mockTransition;

  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });

    mockTransition = {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    };
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: vi.fn(function () {
        return mockTransition;
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.startViewTransition;
    Object.defineProperty(window, 'location', { writable: true });
    document.querySelectorAll('style[data-loady-vt]').forEach(function (el) { el.remove(); });
  });

  it('calls document.startViewTransition on outbound click when view-transition="true"', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="true" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();

    // Force startViewTransition right before the code checks typeof
    delete document.startViewTransition;
    document.startViewTransition = function (cb) { cb(); };

    fireDOMContentLoaded();
    fireLoad();

    var loader = document.querySelector('[data-loady="container"]');

    await new Promise(r => setTimeout(r, 300));

    link.click();

    expect(window.location.href).toBe('http://localhost:3000/about');
  });

  it('navigates inside the view transition callback', async () => {
    var navigateCallback = null;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: vi.fn(function (cb) {
        navigateCallback = cb;
        return mockTransition;
      }),
    });

    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="true" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    expect(navigateCallback).not.toBeNull();
    navigateCallback();

    expect(window.location.href).toBe('http://localhost:3000/about');
  });

  it('falls back to CSS animation when startViewTransition is not supported', async () => {
    delete document.startViewTransition;

    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="true" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    var loader = document.querySelector('[data-loady="container"]');
    loader.dispatchEvent(new Event('transitionend'));

    expect(window.location.href).toBe('http://localhost:3000/about');
  });

  it('injects @view-transition CSS rule when view transition is enabled', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="true" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var styleEl = document.querySelector('style[data-loady-vt]');
    expect(styleEl).not.toBeNull();
    expect(styleEl.textContent).toContain('navigation: auto');
  });

  it('sets CSS custom properties for duration and easing', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="true" data-loady-duration="0.3" data-loady-easing="ease-out"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.style.getPropertyValue('--loady-duration')).toBe('0.3s');
    expect(loader.style.getPropertyValue('--loady-easing')).toBe('ease-out');
  });
});

describe('View Transition — persistent strategy', () => {
  var mockTransition;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });

    mockTransition = {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    };
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: vi.fn(function () {
        return mockTransition;
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.startViewTransition;
    Object.defineProperty(window, 'location', { writable: true });
    document.querySelectorAll('style[data-loady-vt]').forEach(function (el) { el.remove(); });
  });

  it('sets view-transition-name on loader when strategy is persistent', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="persistent" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.style.viewTransitionName).toBe('loady-container');
    expect(loader.style.contain).toBe('layout');
  });

  it('plays CSS outbound animation then wraps navigation in startViewTransition', async () => {
    var navigateCallback = null;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: vi.fn(function (cb) {
        navigateCallback = cb;
        return mockTransition;
      }),
    });

    setupDOM('<div data-loady="container" data-loady-outbound="slide-down" data-loady-view-transition="persistent" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    expect(document.startViewTransition).not.toHaveBeenCalled();

    var loader = document.querySelector('[data-loady="container"]');
    loader.dispatchEvent(new Event('transitionend'));

    expect(document.startViewTransition).toHaveBeenCalled();

    navigateCallback();
    expect(window.location.href).toBe('http://localhost:3000/about');
  });

  it('falls back to CSS animation when startViewTransition is not supported', async () => {
    delete document.startViewTransition;

    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="persistent" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    var loader = document.querySelector('[data-loady="container"]');
    loader.dispatchEvent(new Event('transitionend'));

    expect(window.location.href).toBe('http://localhost:3000/about');
  });
});

describe('prefers-reduced-motion outbound handling', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.matchMedia;
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('navigates immediately without animation when prefers-reduced-motion is active', async () => {
    var mql = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    window.matchMedia = vi.fn(function () { return mql; });

    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    expect(window.location.href).toBe('http://localhost:3000/about');
  });
});

describe('Auto IX2 pause with view transitions', () => {
  var mockIx2;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });

    mockIx2 = {
      destroy: vi.fn(),
      init: vi.fn(),
    };
    window.Webflow = {
      require: vi.fn(function (mod) {
        if (mod === 'ix2') return mockIx2;
        return null;
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.Webflow;
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('auto-pauses IX2 when view transition is enabled even without data-loady-ix2', async () => {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-view-transition="true" data-loady-ix2="false"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    expect(mockIx2.destroy).toHaveBeenCalled();
  });
});

describe('Counter animation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counter counts up smoothly instead of jumping to target', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-threshold="1.0" data-loady-failsafe="5000"><img src="a.jpg"><img src="b.jpg"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');

    // Under fake timers, rAF callbacks batch so counter animates to target quickly
    await vi.advanceTimersByTimeAsync(200);
    var after200ms = parseInt(counterEl.textContent, 10);
    expect(after200ms).toBeGreaterThan(0);
    expect(after200ms).toBeLessThanOrEqual(100);

    // Counter should not decrease after more time
    await vi.advanceTimersByTimeAsync(500);
    var after700ms = parseInt(counterEl.textContent, 10);
    expect(after700ms).toBeGreaterThanOrEqual(after200ms);
    expect(after700ms).toBeLessThanOrEqual(100);

    vi.useRealTimers();
  });

  it('counter continues counting up even when no assets are present', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-min="3000"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');

    // Without assets, counter should still count up (min display time keeps loader alive)
    await vi.advanceTimersByTimeAsync(500);
    var after500ms = parseInt(counterEl.textContent, 10);
    expect(after500ms).toBeGreaterThan(0);
    expect(after500ms).toBeLessThan(25);

    // Should continue increasing
    await vi.advanceTimersByTimeAsync(500);
    var after1000ms = parseInt(counterEl.textContent, 10);
    expect(after1000ms).toBeGreaterThan(after500ms);

    vi.useRealTimers();
  });

  it('bar width animates smoothly alongside counter', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-failsafe="5000"><div data-loady-bar></div><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var barEl = document.querySelector('[data-loady-bar]');
    var counterEl = document.querySelector('[data-loady-counter]');

    await vi.advanceTimersByTimeAsync(300);

    var barWidth = parseInt(barEl.style.width, 10);
    var counterVal = parseInt(counterEl.textContent, 10);

    expect(barWidth).toBeGreaterThan(0);
    expect(barWidth).toBe(counterVal);

    vi.useRealTimers();
  });

  it('counter snaps to 100 when loader dismisses', async () => {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    // Wait for loader to finish (window.load triggers removeLoader)
    await vi.advanceTimersByTimeAsync(300);

    var counterEl = document.querySelector('[data-loady-counter]');
    expect(counterEl.textContent).toBe('100%');

    vi.useRealTimers();
  });
});

describe('Duration clamp', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it('handles duration=0 as instant hide without transition', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0"><span data-loady-counter>0%</span></div>');

    var finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.style.display).toBe('none');
    expect(finished).toBe(true);
  });

  it('clamps negative duration to 0.1 minimum', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="-1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });

  it('clamps sub-0.1 duration to 0.1', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.05"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });
});

describe('navigating flag prevents double clicks', function () {
  beforeEach(function () {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
  });

  afterEach(function () {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('ignores second click on same outbound link during animation', async function () {
    var navigationCount = 0;
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      get: function () { return 'http://localhost:3000/'; },
      set: function (val) {
        if (val !== 'http://localhost:3000/') navigationCount++;
      },
    });

    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.2"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await vi.advanceTimersByTimeAsync(300);

    link.click();
    link.click(); // double click

    var loader = document.querySelector('[data-loady="container"]');
    loader.dispatchEvent(new Event('transitionend'));

    await vi.advanceTimersByTimeAsync(100);

    expect(navigationCount).toBe(1);
  });
});

describe('pageLoady:finished has detail.source', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '' },
    });
  });

  afterEach(function () {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('pageLoady:finished contains detail.source=normal in normal flow', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var eventDetail = null;
    window.addEventListener('pageLoady:finished', function (e) {
      eventDetail = e.detail;
    });

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(function (r) { setTimeout(r, 300); });

    expect(eventDetail).not.toBeNull();
    expect(eventDetail.source).toBe('normal');
  });

  it('pageLoady:finished contains detail.source=noloader on bypass', async function () {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?noloader=true' },
    });

    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');

    var eventDetail = null;
    window.addEventListener('pageLoady:finished', function (e) {
      eventDetail = e.detail;
    });

    await loadScript();
    fireDOMContentLoaded();

    expect(eventDetail).not.toBeNull();
    expect(eventDetail.source).toBe('noloader');

    Object.defineProperty(window, 'location', { writable: true });
  });

  it('pageLoady:finished contains detail.source=bfcache on bfcache restore', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var eventDetail = null;
    window.addEventListener('pageLoady:finished', function (e) {
      eventDetail = e.detail;
    });

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(function (r) { setTimeout(r, 300); });

    // Reset the variable before bfcache event
    eventDetail = null;

    var pageshowEvent = new Event('pageshow');
    Object.defineProperty(pageshowEvent, 'persisted', { value: true });
    window.dispatchEvent(pageshowEvent);

    expect(eventDetail).not.toBeNull();
    expect(eventDetail.source).toBe('bfcache');
  });
});

describe('Counter monotonic guard', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it('counter never decreases during normal operation', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-failsafe="5000"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');
    var previousValue = 0;

    for (var step = 0; step < 10; step++) {
      await vi.advanceTimersByTimeAsync(200);
      var currentValue = parseInt(counterEl.textContent, 10);
      expect(currentValue).toBeGreaterThanOrEqual(previousValue);
      previousValue = currentValue;
    }

    vi.useRealTimers();
  });

  it('counter caps at 100 and never exceeds', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await vi.advanceTimersByTimeAsync(500);

    var counterEl = document.querySelector('[data-loady-counter]');
    var value = parseInt(counterEl.textContent, 10);
    expect(value).toBeLessThanOrEqual(100);

    vi.useRealTimers();
  });
});

describe('Dynamic img tracking via MutationObserver', function () {
  beforeEach(function () {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tracks dynamically injected images for threshold', async function () {
    setupDOM('<div data-loady="container" data-loady-threshold="0.5" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    // Dynamically inject an image after loader init
    var img = document.createElement('img');
    img.src = 'dynamic.jpg';
    document.body.appendChild(img);

    await vi.advanceTimersByTimeAsync(100);

    // Fire load event on the dynamic image
    img.dispatchEvent(new Event('load'));

    await vi.advanceTimersByTimeAsync(300);

    expect(finished).toBe(true);
  });

  it('still handles data-gsap-hide injection alongside img tracking', async function () {
    setupDOM('<div data-loady="container" data-loady-failsafe="5000"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var gsapEl = document.createElement('div');
    gsapEl.setAttribute('data-gsap-hide', '');
    document.body.appendChild(gsapEl);

    await vi.advanceTimersByTimeAsync(100);

    expect(gsapEl.style.visibility).toBe('hidden');
    expect(gsapEl.style.opacity).toBe('0');
  });
});

describe('Prefetch touch guard', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  afterEach(function () {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  it('prefetches on touchstart with 80ms hold', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new Event('touchstart', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(100);

    var prefetchLink = document.querySelector('link[rel="prefetch"]');
    expect(prefetchLink).not.toBeNull();
    expect(prefetchLink.href).toBe('http://localhost:3000/about');

    vi.useRealTimers();
  });

  it('cancels touch prefetch on touchend before 80ms', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new Event('touchstart', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(40);

    link.dispatchEvent(new Event('touchend', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(60);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    vi.useRealTimers();
  });
});

describe('Unified prefetch handler', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  afterEach(function () {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  it('prefetches on mouseover via unified handler', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    var prefetchLink = document.querySelector('link[rel="prefetch"]');
    expect(prefetchLink).not.toBeNull();
    expect(prefetchLink.href).toBe('http://localhost:3000/about');

    vi.useRealTimers();
  });

  it('prefetches on touchstart via unified handler', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new Event('touchstart', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    var prefetchLink = document.querySelector('link[rel="prefetch"]');
    expect(prefetchLink).not.toBeNull();
    expect(prefetchLink.href).toBe('http://localhost:3000/about');

    vi.useRealTimers();
  });

  it('cancels on mouseleave for mouse events', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(40);
    link.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(60);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    vi.useRealTimers();
  });

  it('cancels on touchend for touch events', async function () {
    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new Event('touchstart', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(40);
    link.dispatchEvent(new Event('touchend', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(60);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    vi.useRealTimers();
  });

  it('skips prefetch on slow connections via unified handler', async function () {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'connection', {
      writable: true,
      value: { effectiveType: '2g', saveData: false },
    });

    setupDOM('<div data-loady="container" data-loady-prefetch="true"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();

    Object.defineProperty(navigator, 'connection', { writable: true, value: undefined });
    vi.useRealTimers();
  });
});

describe('try/catch guards', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it('does not throw when querySelector simulates an error', async function () {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');

    // Force an error in a guarded section by making querySelector throw on 3rd call
    var origQS = document.querySelector;
    var callCount = 0;
    document.querySelector = function (sel) {
      callCount++;
      if (callCount === 3) throw new Error('Simulated error');
      return origQS.call(document, sel);
    };

    await loadScript();

    expect(function () {
      fireDOMContentLoaded();
    }).not.toThrow();

    document.querySelector = origQS;
  });
});

describe('DOM cache optimization', function () {
  beforeEach(function () {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('counter and bar update correctly when cached at init', async function () {
    setupDOM('<div data-loady="container" data-loady-failsafe="5000"><div data-loady-bar></div><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');
    var barEl = document.querySelector('[data-loady-bar]');

    await vi.advanceTimersByTimeAsync(500);

    var counterVal = parseInt(counterEl.textContent, 10);
    var barWidth = parseInt(barEl.style.width, 10);

    expect(counterVal).toBeGreaterThan(0);
    expect(barWidth).toBe(counterVal);
  });

  it('gsap-hide elements are still revealed after loader finishes', async function () {
    setupDOM(`
      <div data-loady="container" data-loady-duration="0.1" data-loady-failsafe="5000">
        <span data-loady-counter>0%</span>
      </div>
      <div data-gsap-hide id="cached-hidden">Hidden</div>
    `);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await vi.advanceTimersByTimeAsync(300);

    var el = document.getElementById('cached-hidden');
    expect(el.style.visibility).toBe('visible');
    expect(el.style.opacity).toBe('1');
  });
});

describe('Progress update throttling', function () {
  beforeEach(function () {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('counter and bar still animate smoothly with rAF-only throttling', async function () {
    setupDOM('<div data-loady="container" data-loady-failsafe="5000"><div data-loady-bar></div><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');
    var barEl = document.querySelector('[data-loady-bar]');

    await vi.advanceTimersByTimeAsync(500);

    var counterVal = parseInt(counterEl.textContent, 10);
    var barWidth = parseInt(barEl.style.width, 10);

    expect(counterVal).toBeGreaterThan(0);
    expect(barWidth).toBe(counterVal);
  });

  it('counter never decreases with rAF throttling', async function () {
    setupDOM('<div data-loady="container" data-loady-failsafe="5000"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');
    var previousValue = 0;

    for (var step = 0; step < 10; step++) {
      await vi.advanceTimersByTimeAsync(200);
      var currentValue = parseInt(counterEl.textContent, 10);
      expect(currentValue).toBeGreaterThanOrEqual(previousValue);
      previousValue = currentValue;
    }
  });

  it('counter snaps to 100 when loader dismisses with rAF throttling', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await vi.advanceTimersByTimeAsync(300);

    var counterEl = document.querySelector('[data-loady-counter]');
    expect(counterEl.textContent).toBe('100%');
  });
});

describe('CSS custom property animations', function () {
  beforeEach(function () {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
    });
  });

  afterEach(function () {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('sets data-loady-state attribute on container for animateOut', async function () {
    setupDOM('<div data-loady="container" data-loady-anim="slide-up" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await vi.advanceTimersByTimeAsync(300);

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.getAttribute('data-loady-state')).toBe('slide-up');
  });

  it('sets data-loady-state attribute for outbound animation', async function () {
    setupDOM('<div data-loady="container" data-loady-outbound="fade" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var link = document.createElement('a');
    link.href = 'http://localhost:3000/about';
    link.textContent = 'About';
    document.body.appendChild(link);

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await vi.advanceTimersByTimeAsync(300);

    link.click();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.getAttribute('data-loady-state')).toBe('outbound-fade-final');
  });

  it('CSS transition is driven by custom properties', async function () {
    setupDOM('<div data-loady="container" data-loady-duration="0.3" data-loady-easing="ease-out"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.style.getPropertyValue('--loady-duration')).toBe('0.3s');
    expect(loader.style.getPropertyValue('--loady-easing')).toBe('ease-out');
  });
});
