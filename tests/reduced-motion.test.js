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

describe('reduced-motion counter behavior', function () {
  beforeEach(function () {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(function () {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.matchMedia;
  });

  it('snaps counter to target without interpolation when prefers-reduced-motion is active', async function () {
    window.matchMedia = function (q) {
      if (q === '(prefers-reduced-motion: reduce)') {
        return { matches: true, addEventListener: function () {}, removeEventListener: function () {} };
      }
      return { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
    };

    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-min="3000"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');

    await vi.advanceTimersByTimeAsync(500);
    var val = parseInt(counterEl.textContent, 10);
    expect(val).toBeGreaterThanOrEqual(85);

    vi.useRealTimers();
  });

  it('still interpolates the counter when prefers-reduced-motion is not active', async function () {
    window.matchMedia = function () {
      return { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
    };

    vi.useFakeTimers();
    setupDOM('<div data-loady="container" data-loady-min="3000"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var counterEl = document.querySelector('[data-loady-counter]');
    await vi.advanceTimersByTimeAsync(500);
    var val = parseInt(counterEl.textContent, 10);
    expect(val).toBeLessThan(85);

    vi.useRealTimers();
  });
});
