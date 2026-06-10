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
  var origAdd = document.addEventListener;
  document.addEventListener = function (type, fn, opts) {
    if (type === 'click') _clickFns.push(fn);
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
  });

  it('shows GSAP and IX2 status in debug table', async () => {
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

    var finalEvt = progressEvents.find(function (e) { return e.phase === 'animating'; });
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
