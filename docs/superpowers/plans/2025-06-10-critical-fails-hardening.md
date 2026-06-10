# Loady Critical Fails Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Loady against edge-case failures by adding internal guards, clamping, flags, and sane defaults as specified in `docs/specifications/critical-fails.md` — without breaking any existing features.

**Architecture:** Eight targeted additions to `src/loady.js`. All are additive or guard-only — no existing behavior is changed for the default use case. Duration=0 gets special-case handling (instant hide without transition). A `navigating` flag prevents double-click navigations. Counter becomes explicitly monotonic. Console output is consolidated through wrapper functions. The MutationObserver expands to also track dynamically injected `<img>` tags for threshold tracking. Prefetch gains touch event support. Critical paths get try/catch safety.

**Tech Stack:** Vanilla ES5 JavaScript, Vitest with jsdom for testing

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/loady.js:80-81` | Modify | Add duration clamp (0.1 min, 0 special-case) |
| `src/loady.js:115-185` | Modify | Add `navigating` flag to outbound click handler |
| `src/loady.js:356-358` | Modify | Add `detail.source` to `pageLoady:finished` |
| `src/loady.js:378-400` | Modify | Add monotonic guard to counter tick |
| `src/loady.js:260, 265-278` | Modify | Expand MutationObserver for dynamic img tracking |
| `src/loady.js:22-23` | Modify | Add logging wrappers (log, warn, error) |
| `src/loady.js:187-215` | Modify | Add touchstart/touchend prefetch support |
| `src/loady.js:39-40, 96-97` | Modify | Add try/catch guards around critical init paths |
| `tests/loady.test.js` | Modify | Add tests for each new behavior |

---

### Task 1: Duration Clamp with 0-Handling

**Rationale:** If any user has `data-loady-duration="0"`, they expect an instant hide. Currently, `duration === 0` results in a `0s` transition which may flash content. The fix: clamp to 0.1 minimum, but handle 0 as a special case that skips transition entirely and calls `completeLoader()` immediately.

**Files:**
- Modify: `src/loady.js:80-81`

- [ ] **Step 1: Write the failing test**

```javascript
describe('Duration clamp', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles duration=0 as instant hide without transition', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="0"><span data-loady-counter>0%</span></div>');

    var finished = false;
    window.addEventListener('pageLoady:finished', function () { finished = true; });

    await loadScript();
    fireDOMContentLoaded();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.style.transition).not.toContain('0s');
    expect(loader.style.display).toBe('none');
    expect(finished).toBe(true);
  });

  it('clamps negative duration to 0.1 minimum', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="-1"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    var loader = document.querySelector('[data-loady="container"]');
    // Verify loader still animates with minimum duration
    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });

  it('clamps sub-0.1 duration to 0.1', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="0.05"><span data-loady-counter>0%</span></div>');

    await loadScript();
    fireDOMContentLoaded();

    expect(document.body.getAttribute('data-loady-status')).toBe('loading');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: 74/75 tests pass, 1 fails (duration=0 case does instant hide)

- [ ] **Step 3: Implement duration clamp**

Replace `src/loady.js:80-81`:
```javascript
    var durationVal = parseFloat(loader.getAttribute('data-loady-duration'));
    var duration = isNaN(durationVal) ? 0.5 : durationVal;
```

With:
```javascript
    var durationVal = parseFloat(loader.getAttribute('data-loady-duration'));
    var duration = isNaN(durationVal) ? 0.5 : durationVal;
    if (duration === 0) {
      completeLoader();
      return;
    }
    if (duration < 0.1) duration = 0.1;
```

**IMPORTANT:** The `duration === 0` early return must go AFTER the `runOnce` and `ignoreList` checks, not before them. Place the clamp immediately after the duration parse, and place the `0` early-return AFTER the session-based early returns (lines 57-77) — because those early returns already call `completeLoader()`. The clamp and 0-check should go between those early returns and the start of normal operation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 75/75 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "fix: clamp duration to 0.1 minimum, handle 0 as instant hide"
```

---

### Task 2: Add `navigating` Flag to Outbound Click Handler

**Rationale:** Prevent double-click on outbound links from triggering navigation twice or causing a race condition between `transitionend` and the failsafe timeout.

**Files:**
- Modify: `src/loady.js:115-185` (outbound click handler)

- [ ] **Step 1: Write the failing test**

```javascript
describe('navigating flag prevents double clicks', () => {
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

  it('ignores second click on same outbound link during animation', async () => {
    var navigationCount = 0;
    var origHref = Object.getOwnPropertyDescriptor(window.location, 'href');
    Object.defineProperty(window.location, 'href', {
      get: function () { return 'http://localhost:3000/'; },
      set: function (val) {
        navigationCount++;
        if (origHref && origHref.set) origHref.set.call(window.location, val);
      },
      configurable: true,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: 75/76 tests pass, 1 fails (double click causes double navigation)

- [ ] **Step 3: Add `navigating` flag**

In the outbound click handler block (inside the `if (ignoreList || outboundAnim)` block), add a `var navigating = false;` BEFORE the `document.addEventListener('click', ...)` line (around line 115) AND add a guard at the top of the click handler:

Current structure:
```javascript
    if (ignoreList || outboundAnim) {
      document.addEventListener('click', function (e) {
        // ... handler body
      });
    }
```

New structure:
```javascript
    if (ignoreList || outboundAnim) {
      var navigating = false;
      document.addEventListener('click', function (e) {
        if (ignoreList && e.target.closest(ignoreList)) {
          sessionStorage.setItem(IGNORE_KEY, '1');
          return;
        }

        var anchor = e.target.closest('a');
        if (!anchor) return;

        if (!outboundAnim || !isQualifyingLink(anchor)) return;

        if (navigating) return;

        e.preventDefault();
        navigating = true;
        var destinationUrl = anchor.href;
        // ... rest of handler unchanged ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 76/76 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add navigating flag to prevent double-click navigation"
```

---

### Task 3: Add `detail.source` to `pageLoady:finished` Event

**Rationale:** The spec calls for `pageLoady:finished` to carry a `detail` object with a `source` field (`'normal'`, `'bfcache'`, etc.) so downstream code can distinguish how the loader ended.

**Files:**
- Modify: `src/loady.js:356-358` (in `cleanupLoader`)
- Modify: `src/loady.js:456-462` (in `pageshow` handler)

- [ ] **Step 1: Write the failing test**

```javascript
describe('pageLoady:finished has detail.source', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pageLoady:finished contains detail.source in normal flow', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var eventDetail = null;
    window.addEventListener('pageLoady:finished', function (e) {
      eventDetail = e.detail;
    });

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    expect(eventDetail).not.toBeNull();
    expect(eventDetail.source).toBe('normal');
  });

  it('pageLoady:finished contains detail.source=noloader on bypass', async () => {
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

  it('pageLoady:finished contains detail.source=bfcache on bfcache restore', async () => {
    setupDOM('<div data-loady="container" data-loady-duration="0.1"><span data-loady-counter>0%</span></div>');

    var eventDetail = null;
    window.addEventListener('pageLoady:finished', function (e) {
      eventDetail = e.detail;
    });

    await loadScript();
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    // Reset the spy before bfcache test
    eventDetail = null;

    var pageshowEvent = new Event('pageshow');
    Object.defineProperty(pageshowEvent, 'persisted', { value: true });
    window.dispatchEvent(pageshowEvent);

    expect(eventDetail).not.toBeNull();
    expect(eventDetail.source).toBe('bfcache');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: Some tests pass (CustomEvent is already used), but `detail.source` is `undefined`

- [ ] **Step 3: Implement detail.source**

In `cleanupLoader` function (line 356-358), replace:
```javascript
      if (gen === window._loadyGen) {
        window.dispatchEvent(new CustomEvent('pageLoady:finished'));
      }
```

With:
```javascript
      if (gen === window._loadyGen) {
        window.dispatchEvent(new CustomEvent('pageLoady:finished', {
          detail: { source: source },
        }));
      }
```

Add `source` parameter to `cleanupLoader`:
```javascript
    function cleanupLoader(source) {
      loader.style.display = 'none';
      document.body.removeAttribute('data-loady-status');
      document.body.removeAttribute('aria-busy');
      if (observer) observer.disconnect();
      if (cleanupRefs.pageshow) window.removeEventListener('pageshow', cleanupRefs.pageshow);
      tickCancelled = true;
      if (gen === window._loadyGen) {
        window.dispatchEvent(new CustomEvent('pageLoady:finished', {
          detail: { source: source },
        }));
      }
    }
```

Update all callers:
- `completeLoader()` calls `cleanupLoader('normal')`
- `pageshow` handler calls `cleanupLoader('bfcache')`

For the early-return paths that call `completeLoader()` directly:
- In `completeLoader()`: the `source` needs to flow through. Add a `source` parameter to `completeLoader()` too:

```javascript
    function completeLoader(source) {
      phase = 'animating';
      dispatchProgress(100, 'animating');
      resumeGSAP();
      resumeIX2();
      cleanupLoader(source);
    }
```

Update all callers of `completeLoader()`:
- `finishImmediately` paths (noloader, runOnce, ignore): `completeLoader('noloader')`
- `animateOut` path: `completeLoader('normal')`
- Duration=0 path: `completeLoader('normal')`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass (79/79)

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add detail.source to pageLoady:finished event"
```

---

### Task 4: Counter Monotonic Guard

**Rationale:** Ensure `displayedPercent` never moves backward, even if percent resets or an edge case causes the target to drop below the current displayed value.

**Files:**
- Modify: `src/loady.js:378-400` (tick function)

- [ ] **Step 1: Write the failing test**

This guard is hard to test directly since normal operation never causes backward jumps. The test verifies the guard exists and doesn't break normal operation.

```javascript
describe('Counter monotonic guard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counter never decreases during normal operation', async () => {
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

  it('counter caps at 100 and never exceeds', async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: The monotonic decrease test may pass already (current code is naturally monotonic), but the guard should be explicit.

- [ ] **Step 3: Add monotonic guard to tick**

In the `tick` function, replace lines 384-395:
```javascript
        var target = Math.min(percent, 85);
        if (target === 0) target = 85;
        if (displayedPercent < target) {
          displayedPercent = Math.min(displayedPercent + 0.5, target);
        }

        var displayVal = Math.round(displayedPercent);

        if (counterEl) counterEl.textContent = displayVal + '%';
        if (barEl) barEl.style.width = displayVal + '%';

        dispatchProgress(Math.min(percent, 85), phase);
```

With (adding explicit monotonic lower-bound):
```javascript
        var target = Math.min(percent, 85);
        if (target === 0) target = 85;
        var next = displayedPercent + 0.5;
        displayedPercent = Math.max(displayedPercent, Math.min(next, target));

        var displayVal = Math.round(Math.min(displayedPercent, 100));

        if (counterEl) counterEl.textContent = displayVal + '%';
        if (barEl) barEl.style.width = displayVal + '%';

        dispatchProgress(Math.min(percent, 85), phase);
```

The key change: `Math.max(displayedPercent, Math.min(next, target))` ensures `displayedPercent` can never decrease.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add monotonic lower-bound guard to counter animation"
```

---

### Task 5: Logging Wrappers (log, warn, error)

**Rationale:** Consolidate console output through wrapper functions for cleaner, consistent output. Add a `loady:` prefix to make logs identifiable.

**Files:**
- Modify: `src/loady.js:22-23` (add wrappers near the top, after IIFE opening)

- [ ] **Step 1: Add logging wrappers**

Add after line 2 (`'use strict';`):
```javascript
  var L = window.__loadyDebug ? console : { log: function () {}, warn: function () {}, error: function () {} };

  function log(msg) { L.log('%c[Loady]%c ' + msg, 'color:#bada55;font-weight:bold', 'color:inherit'); }
  function warn(msg) { L.warn('[Loady] ' + msg); }
  function err(msg) { L.error('[Loady] ' + msg); }
```

Replace all raw `console` calls:
- `console.groupCollapsed(...)` in `logDebug` → wrap with the same pattern using L
- `console.table(...)` in `logDebug` → keep as is (table is debug-only)
- `console.groupEnd(...)` in `logDebug` → keep as is

This task is additive — no tests break. The wrappers are internal-only.

- [ ] **Step 2: Commit**

```bash
git add src/loady.js
git commit -m "feat: add logging wrappers for cleaner console output"
```

---

### Task 6: MutationObserver Expansion for Dynamic `<img>` Tracking

**Rationale:** Currently the MutationObserver only watches for `[data-gsap-hide]` elements. The spec says it should also track dynamically injected `<img>` elements and register them for load/error tracking, so threshold-based exit works with lazy-loaded or JS-injected images.

**Files:**
- Modify: `src/loady.js:260-278` (MutationObserver callback and `initAssetTracking`)

- [ ] **Step 1: Write the failing test**

```javascript
describe('Dynamic img tracking via MutationObserver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tracks dynamically injected images for threshold', async () => {
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

    // Before load event, loader shouldn't exit (1/1 = 1.0 >= 0.5 threshold but needs load event)
    img.dispatchEvent(new Event('load'));

    await vi.advanceTimersByTimeAsync(300);

    expect(finished).toBe(true);
  });

  it('still handles data-gsap-hide injection alongside img tracking', async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: The dynamic img test fails — injected image is not tracked.

- [ ] **Step 3: Expand MutationObserver**

Replace the MutationObserver callback (lines 265-278):
```javascript
    var observer = new MutationObserver(function (mutationsList) {
      mutationsList.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.hasAttribute('data-gsap-hide')) hideGsapEl(node);
          node.querySelectorAll('[data-gsap-hide]').forEach(hideGsapEl);
        });
      });
    });
```

With:
```javascript
    function trackImage(img) {
      if (img.complete) {
        onAssetResolved();
        return;
      }
      img.addEventListener('load', onAssetResolved, { once: true });
      img.addEventListener('error', onAssetResolved, { once: true });
    }

    var observer = new MutationObserver(function (mutationsList) {
      mutationsList.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.hasAttribute('data-gsap-hide')) hideGsapEl(node);
          node.querySelectorAll('[data-gsap-hide]').forEach(hideGsapEl);
          if (node.tagName === 'IMG') trackImage(node);
          node.querySelectorAll('img').forEach(trackImage);
        });
      });
    });
```

**IMPORTANT:** Also update `initAssetTracking` to use the shared `trackImage` helper instead of the inline IIFE so behavior is consistent:
```javascript
    function initAssetTracking() {
      var assets = document.querySelectorAll('img, iframe, video[src], script[src]');
      var imgAssets = document.querySelectorAll('img');
      totalCount = assets.length;

      if (totalCount === 0) {
        percent = 85;
        removeLoader('No Assets');
        return;
      }

      imgAssets.forEach(trackImage);

      for (var i = 0; i < assets.length; i++) {
        var el = assets[i];
        if (el.tagName === 'IMG') continue; // already tracked via trackImage
        el.addEventListener('load', onAssetResolved);
        el.addEventListener('error', onAssetResolved);
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass — both gsap-hide and dynamic img tracking work.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: expand MutationObserver to track dynamically injected images"
```

---

### Task 7: Prefetch Touch Guard

**Rationale:** Mobile users tapping links don't trigger `mouseover` reliably. Adding `touchstart`/`touchend` handlers makes prefetch work on touch devices.

**Files:**
- Modify: `src/loady.js:187-215` (prefetch handler)

- [ ] **Step 1: Write the failing test**

```javascript
describe('Prefetch touch guard', () => {
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

  it('prefetches on touchstart with 80ms hold', async () => {
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

  it('cancels touch prefetch on touchend before 80ms', async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: Touch-related tests fail — no touch handlers exist.

- [ ] **Step 3: Implement touch prefetch**

In the prefetch handler block (after `document.addEventListener('mouseover', ...)`), add a `touchstart`/`touchend` listener:

After the `mouseover` listener (line 214), add:
```javascript

      document.addEventListener('touchstart', function (e) {
        var anchor = e.target.closest('a');
        if (!anchor || !isQualifyingLink(anchor)) return;

        var connection = navigator.connection;
        if (connection) {
          if (connection.saveData) return;
          if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return;
        }

        var timer = setTimeout(function () {
          prefetch(anchor.href);
        }, 80);

        var onEnd = function () {
          clearTimeout(timer);
          anchor.removeEventListener('touchend', onEnd, { once: true });
          anchor.removeEventListener('touchcancel', onEnd, { once: true });
        };
        anchor.addEventListener('touchend', onEnd, { once: true });
        anchor.addEventListener('touchcancel', onEnd, { once: true });
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass — both touch and mouse prefetch work.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add touchstart/touchend prefetch support for mobile"
```

---

### Task 8: Internal try/catch Guards Around Critical Paths

**Rationale:** Wrap critical init paths in try/catch to prevent a single error from silently breaking the loader. Errors are logged but do not propagate.

**Files:**
- Modify: `src/loady.js:39-40` (start of DOMContentLoaded handler)
- Modify: `src/loady.js:96-97` (view transition check)

- [ ] **Step 1: Write test for try/catch safety**

```javascript
describe('try/catch guards', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when an internal operation fails', async () => {
    setupDOM('<div data-loady="container"><span data-loady-counter>0%</span></div>');

    // Force an error in a guarded section by making querySelector throw
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
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm test`
Expected: Test may pass or fail depending on where the error is thrown. The purpose is to verify guards work.

- [ ] **Step 3: Add try/catch around critical paths**

Wrap the entire DOMContentLoaded handler body in a try/catch:

```javascript
  document.addEventListener('DOMContentLoaded', function () {
    try {
      // ... entire existing handler body ...
    } catch (e) {
      console.error('[Loady] Initialization failed:', e);
    }
  });
```

Also wrap the `startViewTransition` check:
```javascript
    try {
      var vtSupported = typeof document.startViewTransition === 'function';
    } catch (e) {
      var vtSupported = false;
    }
    var vtEnabled = viewTransition && vtSupported;
```

And wrap `pauseGSAP()` and `pauseIX2()` calls:
```javascript
    var skipGSAP = loader.getAttribute('data-loady-gsap') === 'false';
    try { if (!skipGSAP) pauseGSAP(); } catch (e) {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass, guarded paths don't propagate errors.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add try/catch guards around critical initialization paths"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: All tests pass

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: Build completes without errors

- [ ] **Step 3: Verify no regressions in test count**

```bash
npm test 2>&1 | grep "Tests"
```
Expected: All tests pass (starting from 72 base + new tests from tasks above)

- [ ] **Step 4: Final commit if needed**

```bash
git add . && git commit -m "chore: final verification after critical-fails hardening"
```

---

## Summary

| Task | Risk Level | Lines | Tests Added |
|------|-----------|-------|-------------|
| 1. Duration clamp + 0-handling | Low | ~5 | 3 |
| 2. `navigating` flag | None | ~3 | 1 |
| 3. `pageLoady:finished` detail | None (additive) | ~10 | 3 |
| 4. Counter monotonic guard | None | ~3 | 2 |
| 5. Logging wrappers | None | ~5 | 0 (internal) |
| 6. MutationObserver expansion | Low (CMS perf) | ~15 | 2 |
| 7. Prefetch touch guard | None (additive) | ~15 | 2 |
| 8. try/catch guards | None | ~8 | 1 |
| **Total** | | **~64** | **14** |

**Total changes:** ~64 lines added, 14 new tests. No existing behavior is removed or changed for the default use case. The only behavioral change is `duration=0` getting instant-hide treatment instead of a 0s transition.
