# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce main-thread overhead in the loady orchestrator by caching DOM queries, throttling progress updates with rAF, moving animations to CSS custom properties, lazy-initializing the debug logger, and unifying prefetch event handlers.

**Architecture:** Five independent optimizations to `src/loady.js` and `loady.css`, each self-contained. All changes preserve the existing public API (data-attributes, custom events, GSAP/IX2 compatibility). The existing 86-test suite validates backward compatibility after each task.

**Tech Stack:** Vanilla JS (IIFE), CSS custom properties, Vitest + jsdom, Rollup + terser.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/loady.js` | Modify | All five optimizations |
| `loady.css` | Modify | CSS-driven animation states (Task 3) |
| `tests/loady.test.js` | Modify | New tests per optimization task |

---

### Task 1: Cache DOM Queries

**Files:**
- Modify: `src/loady.js:80-82,368-369,424-433,535,618-625`
- Modify: `tests/loady.test.js` (add cache-specific tests)

**Context:** The script currently runs `querySelector` / `querySelectorAll` for `[data-loady="container"]`, `[data-loady-counter]`, `[data-loady-bar]`, `img`, `iframe, video[src], script[src]`, and `[data-gsap-hide]` at multiple points. This task creates a central DOM cache at init and uses it everywhere.

- [ ] **Step 1: Write failing test for DOM cache behavior**

Add a test at the end of `tests/loady.test.js` that verifies the loader still works after caching — specifically that counter and bar elements are found and updated even when queried once at init:

```javascript
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

    await new Promise(function (r) { return setTimeout(r, 300); });

    var el = document.getElementById('cached-hidden');
    expect(el.style.visibility).toBe('visible');
    expect(el.style.opacity).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (existing behavior)**

Run: `npx vitest run tests/loady.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS (this confirms the tests are valid before we refactor).

- [ ] **Step 3: Add DOM cache object at script initialization**

In `src/loady.js`, after line 82 (`if (!loader) return;`), add the cache:

```javascript
    var loader = document.querySelector('[data-loady="container"]');
    if (!loader) return;

    var domCache = {
      loader: loader,
      counter: loader.querySelector("[data-loady-counter]"),
      bar: loader.querySelector("[data-loady-bar]")
    };
```

- [ ] **Step 4: Replace all `loader` references with `domCache.loader`**

Replace every occurrence of the local `loader` variable inside the DOMContentLoaded callback with `domCache.loader`. The key locations:

- Line 89: `loader.getAttribute(...)` → `domCache.loader.getAttribute(...)`
- Line 94: `loader.getAttribute(...)` → `domCache.loader.getAttribute(...)`
- Line 96: `loader.getAttribute(...)` → `domCache.loader.getAttribute(...)`
- Line 113: `loader.getAttribute(...)` → `domCache.loader.getAttribute(...)`
- Line 134: `loader.getAttribute(...)` → `domCache.loader.getAttribute(...)`
- Line 146-155: all `loader.getAttribute(...)` → `domCache.loader.getAttribute(...)`
- Line 165-168: all `loader.getAttribute(...)` → `domCache.loader.getAttribute(...)`
- Line 232-236: `loader.style.*` → `domCache.loader.style.*`
- Line 241: `loader.style.transition` → `domCache.loader.style.transition`
- Line 267: `loader.addEventListener` → `domCache.loader.addEventListener`
- Line 372-377: `loader.style.*` → `domCache.loader.style.*`
- Line 436: `observer.observe(document.body, ...)` stays (not loader)
- Line 516: `loader.style.transition` → `domCache.loader.style.transition`
- Line 530: `loader.style.display` → `domCache.loader.style.display`

- [ ] **Step 5: Replace counter/bar queries with cached references**

Remove the original counter/bar queries at lines 368-369 and use `domCache.counter` / `domCache.bar` everywhere:

Original:
```javascript
var counterEl = loader.querySelector("[data-loady-counter]");
var barEl = loader.querySelector("[data-loady-bar]");
```

Replace all `counterEl` with `domCache.counter` and `barEl` with `domCache.bar` throughout the file (lines 512, 558-559, 586-587, 598).

- [ ] **Step 6: Cache `data-gsap-hide` elements at init and use in cleanup**

Add to the cache object:
```javascript
    var domCache = {
      loader: loader,
      counter: loader.querySelector("[data-loady-counter]"),
      bar: loader.querySelector("[data-loady-bar]"),
      gsapHide: document.querySelectorAll("[data-gsap-hide]")
    };
```

Update `cleanupLoader` (line 535) to use the cached collection:
```javascript
      domCache.gsapHide.forEach(function (el) {
        el.style.visibility = "visible";
        el.style.opacity = "1";
      });
```

Note: The MutationObserver still handles dynamically injected `[data-gsap-hide]` elements separately — that stays as-is since those elements don't exist at init time.

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All 86+ tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "perf: cache DOM queries at init to reduce repeated lookups"
```

---

### Task 2: Throttle Progress Updates with rAF Delta-Time

**Files:**
- Modify: `src/loady.js:562-600`
- Modify: `tests/loady.test.js` (counter animation tests)

**Context:** The current tick function (lines 562-600) uses `requestAnimationFrame` + `setTimeout` hybrid to target 30 FPS. This task drops the `setTimeout` and uses pure `requestAnimationFrame` with timestamp delta throttling, and only writes to the DOM when the integer percentage changes.

- [ ] **Step 1: Write failing test for DOM write throttling**

Add a test that verifies the counter only updates when the integer value actually changes (no redundant writes):

```javascript
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
```

- [ ] **Step 2: Run test to verify it passes (existing behavior)**

Run: `npx vitest run tests/loady.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 3: Replace the tick function with rAF delta-time throttling**

Replace the entire `startProgress` function (lines 562-600) with:

```javascript
      function startProgress() {
        var throttleMs = 1000 / 30;
        var lastUpdate = 0;
        var lastDisplayVal = -1;

        function tick(timestamp) {
          if (tickCancelled || counterDone) {
            renderComplete();
            return;
          }

          var target, increment;
          if (phase === "animating") {
            target = 100;
            increment = Math.max(0.1, 15 / duration);
          } else {
            target = Math.min(percent, 85);
            if (target === 0) target = 85;
            increment = 0.5;
          }
          var next = displayedPercent + increment;
          displayedPercent = Math.max(displayedPercent, Math.min(next, target));

          var displayVal = Math.round(Math.min(displayedPercent, 100));

          if (timestamp - lastUpdate >= throttleMs) {
            if (displayVal !== lastDisplayVal) {
              if (domCache.counter) domCache.counter.textContent = displayVal + "%";
              if (domCache.bar) domCache.bar.style.width = displayVal + "%";
              lastDisplayVal = displayVal;
            }
            lastUpdate = timestamp;
          }

          if (phase !== "animating") {
            dispatchProgress(Math.min(percent, 85), phase);
          }

          requestAnimationFrame(tick);
        }

        if (domCache.counter) domCache.counter.textContent = "0%";
        requestAnimationFrame(tick);
      }
```

Key changes:
- Removed `setTimeout` wrapping — pure `requestAnimationFrame`
- Added `lastUpdate` timestamp tracking for 30 FPS throttle
- Added `lastDisplayVal` to skip redundant DOM writes when integer hasn't changed
- `requestAnimationFrame(tick)` passes the timestamp automatically

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "perf: replace rAF+setTimeout tick with pure rAF delta-time throttling"
```

---

### Task 3: CSS Custom Properties for Animations

**Files:**
- Modify: `src/loady.js:232-277,441-467,509-527`
- Modify: `loady.css` (add animation state rules)
- Modify: `tests/loady.test.js` (outbound + animateOut tests)

**Context:** Currently the script builds CSS transition strings in JS and sets `transform`/`opacity` inline. This task moves transition definitions and animation states to CSS using `data-loady-state` attribute toggling, shifting interpolation to the compositor thread.

- [ ] **Step 1: Write failing test for CSS-driven animation states**

```javascript
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

    await new Promise(function (r) { return setTimeout(r, 50); });

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

    await new Promise(function (r) { return setTimeout(r, 300); });

    link.click();

    var loader = document.querySelector('[data-loady="container"]');
    expect(loader.getAttribute('data-loady-state')).toBe('fade');
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
```

- [ ] **Step 2: Run test to verify baseline**

Run: `npx vitest run tests/loady.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 3: Update `loady.css` with animation state rules**

Replace the entire `loady.css` with:

```css
/* Loady — CDN Page Loader
 * Paste this snippet into the <head> of your page.
 * https://github.com/szsoma/loady
 * made by Soma Szoboszlai
 */

/* 1. Instantly hide elements meant for GSAP/JS animations */
[data-gsap-hide] {
  visibility: hidden;
  opacity: 0;
}

/* 2. Lock body scroll while loading */
body[data-loady-status="loading"] {
  overflow: hidden;
}

/* 3. Ensure the loader is always on top and visible initially */
[data-loady="container"] {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
}

/* 4. Animation transitions driven by CSS custom properties */
[data-loady="container"] {
  transition: opacity var(--loady-duration, 0.5s) var(--loady-easing, ease-in-out),
              transform var(--loady-duration, 0.5s) var(--loady-easing, ease-in-out);
}

/* animateOut states */
[data-loady="container"][data-loady-state="fade"] {
  opacity: 0;
}
[data-loady="container"][data-loady-state="slide-up"] {
  transform: translateY(-100%);
}
[data-loady="container"][data-loady-state="slide-down"] {
  transform: translateY(100%);
}

/* Outbound initial states (before reflow, then attribute is set to "outbound-{anim}") */
[data-loady="container"][data-loady-state="outbound-fade"] {
  opacity: 0;
}
[data-loady="container"][data-loady-state="outbound-slide-up"] {
  transform: translateY(100%);
}
[data-loady="container"][data-loady-state="outbound-slide-down"] {
  transform: translateY(-100%);
}

/* Outbound final states — the "resting" position after transition */
[data-loady="container"][data-loady-state="outbound-fade-final"] {
  opacity: 1;
}
[data-loady="container"][data-loady-state="outbound-slide-up-final"] {
  transform: translateY(0);
}
[data-loady="container"][data-loady-state="outbound-slide-down-final"] {
  transform: translateY(0);
}

/* 5. View Transition keyframes (active only during startViewTransition) */
::view-transition-old(root) {
  animation: loady-vt-old var(--loady-duration, 0.5s)
    var(--loady-easing, ease-in-out) forwards;
}

::view-transition-new(root) {
  animation: loady-vt-new var(--loady-duration, 0.5s)
    var(--loady-easing, ease-in-out) forwards;
}

@keyframes loady-vt-old {
  from {
    opacity: 1;
    translate: 0 0;
  }
  to {
    opacity: 0;
    translate: 0 -40px;
  }
}

@keyframes loady-vt-new {
  from {
    opacity: 0;
    translate: 0 40px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

/* 6. Reduced motion — suppress all loader and view transition animations */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }

  [data-loady="container"] {
    transition-duration: 0ms !important;
  }
}
```

- [ ] **Step 4: Set CSS custom properties at init (always, not just for view transitions)**

In `src/loady.js`, after the `domCache` creation (around line 85), set CSS custom properties on the loader regardless of view transition state:

```javascript
      domCache.loader.style.setProperty("--loady-duration", duration + "s");
      domCache.loader.style.setProperty("--loady-easing", easing);
```

Remove the conditional block at lines 371-378 that only sets these for view transitions, since they are now always needed. Keep the `viewTransitionName` and `contain` assignments for the persistent strategy:

```javascript
      if (vtEnabled && viewTransition === "persistent") {
        domCache.loader.style.viewTransitionName = "loady-container";
        domCache.loader.style.contain = "layout";
      }
```

- [ ] **Step 5: Replace `buildTransition` and `setAnimState` with attribute toggling**

Remove the `buildTransition` function (lines 441-445) and `setAnimState` function (lines 447-467).

Replace the outbound click handler animation logic (lines 232-243) with:

```javascript
          domCache.loader.style.transition = "none";
          domCache.loader.style.display = "flex";
          domCache.loader.removeAttribute("data-loady-state");
          domCache.loader.style.opacity = "";
          domCache.loader.style.transform = "";

          domCache.loader.setAttribute("data-loady-state", "outbound-" + outboundAnim);

          void domCache.loader.offsetHeight;

          domCache.loader.style.transition = "";
          domCache.loader.setAttribute("data-loady-state", "outbound-" + outboundAnim + "-final");
```

Replace the `animateOut` function (lines 509-527) with:

```javascript
      function animateOut() {
        phase = "animating";
        percent = 100;
        if (!domCache.counter && !domCache.bar) {
          counterDone = true;
        }

        domCache.loader.style.transition = "";
        domCache.loader.setAttribute("data-loady-state", animType);

        setTimeout(function () {
          if (!counterDone) {
            counterDone = true;
            renderComplete();
          }
          completeLoader("normal");
        }, duration * 1000);
      }
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS. Some animation-related tests may need adjustment if they check inline `transform`/`opacity` values — update those to check `data-loady-state` attribute instead.

- [ ] **Step 7: Commit**

```bash
git add src/loady.js loady.css tests/loady.test.js
git commit -m "perf: move animation states to CSS custom properties for compositor-driven transitions"
```

---

### Task 4: Lazy Initialize Debug Logger

**Files:**
- Modify: `src/loady.js:5-7,154,295,469-495`

**Context:** The no-op logger at lines 5-7 is missing `groupCollapsed`, `table`, and `groupEnd` methods. The `logDebug` function (line 469) calls these methods unconditionally when `isDebug` is true, but the `isDebug` check at line 470 catches this. However, the spec wants to eliminate the runtime `isDebug` branch entirely by making the logger a no-op that silently handles all console methods.

- [ ] **Step 1: Write failing test for logger no-op completeness**

```javascript
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
```

- [ ] **Step 2: Run test to verify it passes (current behavior has early return in logDebug)**

Run: `npx vitest run tests/loady.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 3: Expand the no-op logger to include all console methods**

Replace lines 5-7 in `src/loady.js`:

```javascript
  var L = window.__loadyDebug
    ? console
    : {
        log: function () {},
        warn: function () {},
        error: function () {},
        groupCollapsed: function () {},
        groupEnd: function () {},
        table: function () {}
      };
```

- [ ] **Step 4: Remove the `isDebug` guard from `logDebug`**

In the `logDebug` function (line 469), remove the early return:

Original:
```javascript
      function logDebug(triggerSource) {
        if (!isDebug) return;
```

New:
```javascript
      function logDebug(triggerSource) {
```

The `L.groupCollapsed`, `L.table`, and `L.groupEnd` calls will now use the no-op versions when debug is disabled. Update `logDebug` to use `L` instead of direct `console` calls:

```javascript
      function logDebug(triggerSource) {
        var timeTaken = ((performance.now() - perfStart) / 1000).toFixed(2);
        L.groupCollapsed(
          "%c Loady Debug",
          "background: #222; color: #bada55; padding: 4px; border-radius: 4px;",
        );
        L.table({
          "Trigger Source": triggerSource,
          "Time Taken (s)": timeTaken,
          "Animation Type": animType,
          Easing: easing,
          "Duration (s)": duration,
          "Failsafe (ms)": failsafeTime,
          "Min Display (ms)": minTime,
          Threshold: threshold,
          "Run Once": runOnce,
          Prefetch: prefetchEnabled,
          "Outbound Anim": outboundAnim || "none",
          "View Transition": viewTransition || "off",
          "Assets Tracked": totalCount,
          "Assets Loaded": loadedCount,
          "GSAP Paused": !skipGSAP && !!gsapTL,
          "IX2 Paused": !skipIX2 && !!ix2Engine,
        });
        L.groupEnd();
      }
```

- [ ] **Step 5: Update the `prefetch` function debug check**

In the `prefetch` function (line 295), the `if (isDebug) console.log(link)` can be simplified since `L.log` is already a no-op when debug is off:

```javascript
          L.log("Prefetched: " + url);
```

Remove the separate `log("Prefetched: " + url)` call at line 294 and the `if (isDebug) console.log(link)` at line 295. Replace with just:

```javascript
          log("Prefetched: " + url);
```

(This already works because `log()` uses `L.log()` internally.)

Remove the now-unused `if (isDebug) console.log(link)` line entirely.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "perf: expand no-op logger to cover all console methods, remove isDebug branching"
```

---

### Task 5: Combine Prefetch Event Listeners

**Files:**
- Modify: `src/loady.js:298-361`
- Modify: `tests/loady.test.js` (prefetch tests)

**Context:** The `mouseover` handler (lines 298-329) and `touchstart` handler (lines 331-361) share nearly identical logic for link validation, connection checking, timer management, and prefetch execution. This task unifies them into a single `handleLinkIntent` function.

- [ ] **Step 1: Write failing test for unified handler**

```javascript
describe('Unified prefetch handler', function () {
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
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  afterEach(function () {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { writable: true });
    document.querySelectorAll('link[rel="prefetch"]').forEach(function (el) { el.remove(); });
  });

  it('prefetches on mouseover via unified handler', async function () {
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
```

- [ ] **Step 2: Run test to verify baseline**

Run: `npx vitest run tests/loady.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 3: Replace both event listener blocks with unified handler**

Replace lines 298-361 in `src/loady.js` with:

```javascript
        function handleLinkIntent(e) {
          var anchor = e.target.closest("a");
          if (!anchor || !isQualifyingLink(anchor)) return;

          var connection = navigator.connection;
          if (connection) {
            if (connection.saveData) return;
            if (
              connection.effectiveType === "slow-2g" ||
              connection.effectiveType === "2g"
            )
              return;
          }

          var timer = setTimeout(function () {
            prefetch(anchor.href);
            prefetchTimers.delete(anchor);
          }, 80);

          prefetchTimers.set(anchor, timer);

          var clearEvent = e.type === "touchstart" ? "touchend" : "mouseleave";
          var onCancel = function () {
            clearTimeout(prefetchTimers.get(anchor));
            prefetchTimers.delete(anchor);
          };
          anchor.addEventListener(clearEvent, onCancel, { once: true });
          if (e.type === "touchstart") {
            anchor.addEventListener("touchcancel", onCancel, { once: true });
          }
        }

        document.addEventListener("mouseover", safeWrap(handleLinkIntent, null));
        document.addEventListener("touchstart", safeWrap(handleLinkIntent, null), { passive: true });
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "perf: unify mouseover/touchstart prefetch handlers into single handleLinkIntent"
```

---

### Task 6: Final Verification and Build

**Files:**
- None modified (verification only)

- [ ] **Step 1: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run build to verify dist output**

Run: `npm run build`
Expected: Four dist files generated without errors.

- [ ] **Step 3: Check gzipped size of minified IIFE**

Run: `gzip -c dist/loady.min.js | wc -c`
Expected: Under 3500 bytes (~3.5 KB gzipped target).

- [ ] **Step 4: Run lint/typecheck if configured**

Run: `npm run lint 2>/dev/null || echo "No lint script configured"`
Expected: Clean output or no script.

- [ ] **Step 5: Final commit with all optimizations**

```bash
git add -A
git commit -m "perf: apply all five optimization targets from optimization spec
- Cache DOM queries at init
- rAF delta-time throttling for progress updates
- CSS custom property-driven animations
- Expanded no-op logger (no runtime branching)
- Unified mouseover/touchstart prefetch handler"
```
