# View Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `data-loady-view-transition` attribute that delegates the between-pages visual transition to the browser's native View Transition API, with two strategies (crossfade and persistent) and automatic fallback to CSS animation.

**Architecture:** When `data-loady-view-transition` is set and `document.startViewTransition` is supported, the outbound click handler wraps navigation in a view transition instead of using CSS animation. Strategy `true` (crossfade) captures the full page and crossfades. Strategy `persistent` assigns a `view-transition-name` to the loader for a continuous loader effect. CSS keyframes for `::view-transition-*` pseudos are added to `loady.css`. When the API is unsupported, the existing CSS outbound animation runs unchanged.

**Tech Stack:** Vanilla JS (IIFE/ESM), vitest, jsdom, rollup (all existing)

**Prerequisite:** Plan 1 (Outbound Transitions + Hover Prefetch) must be completed first. This plan modifies the outbound click handler added in that plan.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/loady.js` | Modify | Add view transition detection, strategy branching, CSS injection, persistent naming |
| `loady.css` | Modify | Add `::view-transition-*` keyframes and `prefers-reduced-motion` rules |
| `tests/loady.test.js` | Modify | Add tests for view transition strategies and fallback |
| `README.md` | Modify | Document new attribute |

---

## Key Design Decisions

**Feature detection:** `typeof document.startViewTransition === 'function'` checked at init time. The API is either available or not for the entire page lifecycle.

**CSS in static file:** The `::view-transition-*` keyframes are added to `loady.css` (always present, harmless when no transition is active). The `@view-transition { navigation: auto; }` rule is injected via a `<style>` tag by JS only when the feature is enabled — this is the "cross-document bonus" that applies to non-intercepted navigations too.

**CSS custom properties:** Loady sets `--loady-duration` and `--loady-easing` on the loader element so the view transition keyframes inherit them automatically.

**IX2 auto-pause:** When view transitions are active, IX2 pause/resume is automatically applied regardless of `data-loady-ix2`. The View Transition timing makes the IX2 conflict reliable enough to be the default.

---

### Task 1: Crossfade Strategy (default)

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for crossfade view transition**

Append to `tests/loady.test.js`:

```js
describe('View Transition — crossfade strategy', () => {
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
    document.startViewTransition = vi.fn(function () {
      return mockTransition;
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
    fireDOMContentLoaded();
    fireLoad();

    await new Promise(r => setTimeout(r, 300));

    link.click();

    expect(document.startViewTransition).toHaveBeenCalled();
  });

  it('navigates inside the view transition callback', async () => {
    var navigateCallback = null;
    document.startViewTransition = vi.fn(function (cb) {
      navigateCallback = cb;
      return mockTransition;
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- -t "crossfade"`
Expected: FAIL — no view transition logic exists.

- [ ] **Step 3: Add view transition attribute reading and CSS custom properties**

In `src/loady.js`, after the `var prefetchEnabled = ...` line, add:

```js
    var viewTransition = loader.getAttribute('data-loady-view-transition');
    var vtSupported = typeof document.startViewTransition === 'function';
    var vtEnabled = viewTransition && vtSupported;
```

After the `var barEl = ...` line, add:

```js
    if (vtEnabled) {
      loader.style.setProperty('--loady-duration', duration + 's');
      loader.style.setProperty('--loady-easing', easing);
    }
```

- [ ] **Step 4: Inject `@view-transition` CSS rule when view transition is enabled**

After the CSS custom properties block, add:

```js
    if (viewTransition) {
      var vtStyle = document.createElement('style');
      vtStyle.setAttribute('data-loady-vt', '');
      vtStyle.textContent = '@view-transition { navigation: auto; }';
      document.head.appendChild(vtStyle);
    }
```

- [ ] **Step 5: Modify outbound click handler to use view transition for crossfade strategy**

In the combined click handler (added in Plan 1, Task 2), find the section that starts with:

```js
        if (!outboundAnim || !isQualifyingLink(anchor)) return;

        e.preventDefault();
        var destinationUrl = anchor.href;
```

After `var destinationUrl = anchor.href;`, add the view transition branch:

```js
        if (vtEnabled && viewTransition === 'true') {
          document.startViewTransition(function () {
            window.location.href = destinationUrl;
          });
          return;
        }
```

This wraps the crossfade strategy navigation in `startViewTransition`. The rest of the outbound animation code (CSS fallback) continues below for non-view-transition cases.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- -t "crossfade"`
Expected: All crossfade tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add view transition crossfade strategy"
```

---

### Task 2: Persistent Strategy

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for persistent view transition**

Append to `tests/loady.test.js`:

```js
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
    document.startViewTransition = vi.fn(function () {
      return mockTransition;
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
    document.startViewTransition = vi.fn(function (cb) {
      navigateCallback = cb;
      return mockTransition;
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- -t "persistent"`
Expected: FAIL — no persistent strategy logic exists.

- [ ] **Step 3: Set `view-transition-name` on loader for persistent strategy**

In `src/loady.js`, after the CSS custom properties block (inside the `if (vtEnabled)` block), add:

```js
      if (viewTransition === 'persistent') {
        loader.style.viewTransitionName = 'loady-container';
        loader.style.contain = 'layout';
      }
```

- [ ] **Step 4: Refactor outbound click handler to support both strategies**

Replace the entire outbound animation section in the combined click handler (everything from `document.body.setAttribute('aria-busy', 'true');` to the end of the `transitionend` listener) with:

```js
        if (vtEnabled && viewTransition === 'true') {
          document.startViewTransition(function () {
            window.location.href = destinationUrl;
          });
          return;
        }

        document.body.setAttribute('aria-busy', 'true');
        document.body.setAttribute('data-loady-status', 'loading');

        loader.style.transition = 'none';
        loader.style.display = 'flex';
        loader.style.opacity = '';
        loader.style.transform = '';

        switch (outboundAnim) {
          case 'slide-down':
            loader.style.transform = 'translateY(-100%)';
            break;
          case 'slide-up':
            loader.style.transform = 'translateY(100%)';
            break;
          case 'fade':
          default:
            loader.style.opacity = '0';
        }

        void loader.offsetHeight;

        loader.style.transition = 'all ' + duration + 's ' + easing;

        switch (outboundAnim) {
          case 'slide-down':
          case 'slide-up':
            loader.style.transform = 'translateY(0)';
            break;
          case 'fade':
          default:
            loader.style.opacity = '1';
        }

        function doNavigate() {
          if (vtEnabled && viewTransition === 'persistent') {
            document.startViewTransition(function () {
              window.location.href = destinationUrl;
            });
          } else {
            window.location.href = destinationUrl;
          }
        }

        var navigated = false;
        var failsafe = setTimeout(function () {
          if (!navigated) {
            navigated = true;
            doNavigate();
          }
        }, (duration * 1000) + 500);

        loader.addEventListener('transitionend', function () {
          if (!navigated) {
            navigated = true;
            clearTimeout(failsafe);
            doNavigate();
          }
        }, { once: true });
```

This replaces the entire outbound animation block from Task 2, Step 3. The key change is the `doNavigate()` function that wraps navigation in `startViewTransition` for the persistent strategy.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- -t "persistent"`
Expected: All persistent strategy tests PASS.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS (existing + outbound + pageshow + prefetch + crossfade + persistent).

- [ ] **Step 7: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add view transition persistent strategy"
```

---

### Task 3: CSS Additions to loady.css

**Files:**
- Modify: `loady.css`

- [ ] **Step 1: Add view transition keyframes and reduced-motion rules**

Append to `loady.css`:

```css
/* 4. View Transition keyframes (active only during startViewTransition) */
::view-transition-old(root) {
  animation: loady-vt-old var(--loady-duration, 0.5s) var(--loady-easing, ease-in-out) forwards;
}

::view-transition-new(root) {
  animation: loady-vt-new var(--loady-duration, 0.5s) var(--loady-easing, ease-in-out) forwards;
}

@keyframes loady-vt-old {
  from { opacity: 1; translate: 0 0; }
  to   { opacity: 0; translate: 0 -40px; }
}

@keyframes loady-vt-new {
  from { opacity: 0; translate: 0 40px; }
  to   { opacity: 1; translate: 0 0; }
}

/* 5. Reduced motion — suppress all loader and view transition animations */
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

- [ ] **Step 2: Commit**

```bash
git add loady.css
git commit -m "feat: add view transition CSS keyframes and reduced-motion rules"
```

---

### Task 4: Reduced Motion JS Check

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing test for reduced motion skipping outbound animation**

Append to `tests/loady.test.js`:

```js
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
    Object.defineProperty(window, 'location', { writable: true });
  });

  it('navigates immediately without animation when prefers-reduced-motion is active', async () => {
    var mql = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql);

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "prefers-reduced-motion"`
Expected: FAIL — no reduced motion check in outbound handler.

- [ ] **Step 3: Add reduced motion check to outbound click handler**

In the combined click handler, right after `e.preventDefault();` and `var destinationUrl = anchor.href;`, add:

```js
        var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
          window.location.href = destinationUrl;
          return;
        }
```

This goes BEFORE the view transition crossfade branch so reduced motion takes priority.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- -t "prefers-reduced-motion"`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: skip outbound animation on prefers-reduced-motion"
```

---

### Task 5: Auto IX2 Pause When View Transition Active

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing test for auto IX2 pause with view transitions**

Append to `tests/loady.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "Auto IX2 pause"`
Expected: FAIL — IX2 is not paused when `data-loady-ix2="false"` even with view transition enabled.

- [ ] **Step 3: Modify IX2 pause logic to auto-enable when view transition is active**

In `src/loady.js`, find the existing IX2 pause block:

```js
    var skipIX2 = loader.getAttribute('data-loady-ix2') === 'false';
    if (!skipIX2) pauseIX2();
```

Replace with:

```js
    var skipIX2 = loader.getAttribute('data-loady-ix2') === 'false';
    var forceIX2 = !!viewTransition;
    if (!skipIX2 || forceIX2) pauseIX2();
```

This ensures IX2 is always paused when view transitions are active, regardless of the `data-loady-ix2` attribute.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- -t "Auto IX2 pause"`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: auto-pause IX2 when view transition is active"
```

---

### Task 6: Update README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add `data-loady-view-transition` to the Data Attribute API table**

In the Data Attribute API table, add a row after `data-loady-prefetch`:

```markdown
| `data-loady-view-transition` | *(omitted)* | Enables View Transition API for outbound navigation. `true` uses full-page crossfade. `persistent` assigns a `view-transition-name` to the loader for a continuous effect. Falls back to CSS animation if unsupported. Requires `data-loady-outbound`. |
```

- [ ] **Step 2: Add a new section for view transitions**

After the "Hover Prefetch" section, add:

```markdown
## View Transitions

When `data-loady-view-transition` is set alongside `data-loady-outbound`, Loady delegates the between-pages transition to the browser's native View Transition API for GPU-composited, stutter-free transitions.

```html
<div
  data-loady="container"
  data-loady-outbound="slide-down"
  data-loady-view-transition="true"
>
```

### Strategies

| Value | Effect |
|---|---|
| `true` | Full-page crossfade — browser captures old and new page, animates between them |
| `persistent` | Loader persists across the navigation boundary via `view-transition-name` |

When the View Transition API is not supported, Loady falls back to the CSS outbound animation silently.

### Cross-Document Bonus

When view transitions are enabled, Loady also injects `@view-transition { navigation: auto; }`, giving non-intercepted navigations (form submissions, programmatic) a native crossfade in supporting browsers.

### Reduced Motion

When `prefers-reduced-motion: reduce` is active, outbound animations are skipped and navigation happens instantly. View transition keyframes are also suppressed.
```

- [ ] **Step 3: Add Features bullet**

In the Features list, add after the "bfcache handling" bullet:

```markdown
- **View transitions** — `data-loady-view-transition` delegates between-pages transitions to the native View Transition API with crossfade or persistent strategies
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document data-loady-view-transition"
```

---

### Task 7: Build and Final Verification

**Files:**
- Build output: `dist/loady.js`, `dist/loady.min.js`, `dist/loady.esm.js`, `dist/loady.esm.min.js`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests PASS (existing + outbound + pageshow + prefetch + crossfade + persistent + reduced-motion + auto-IX2).

- [ ] **Step 2: Build all dist formats**

Run: `npm run build`
Expected: 4 files output to `dist/` with no errors.

- [ ] **Step 3: Verify the build includes the new code**

Run: `rg -c "startViewTransition|viewTransitionName|loady-vt|prefers-reduced-motion" dist/loady.js`
Expected: A count > 0 confirming new code is in the bundle.

- [ ] **Step 4: Verify loady.css includes view transition keyframes**

Run: `rg -c "view-transition-old|view-transition-new|loady-vt" loady.css`
Expected: A count > 0.

- [ ] **Step 5: Commit dist files**

```bash
git add dist/ loady.css
git commit -m "build: rebuild dist with view transitions and update CSS"
```
