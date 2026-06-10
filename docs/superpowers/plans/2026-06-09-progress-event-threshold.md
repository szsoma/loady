# pageLoady:progress Event & data-loady-threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pageLoady:progress` custom event that exposes real-time loading progress (percent, raw, phase) and a `data-loady-threshold` attribute that lets the loader exit when a fraction of assets have loaded instead of waiting for all.

**Architecture:** The current counter is time-based (0→85% over 2s) and the trigger is `window.load`. This plan replaces both: progress becomes **asset-based** (loaded/total ratio mapped to 0–85%), and the trigger becomes a **threshold check** after each asset resolves. `window.load` is kept as a fallback for the default threshold of 1.0. A `pageLoady:progress` event fires on every tick of the existing rAF loop, and a final dispatch fires at 100% with phase `'animating'` when the exit begins.

**Tech Stack:** Vanilla JS (IIFE/ESM), vitest, jsdom, rollup (all existing)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/loady.js` | Modify | Add asset tracking, progress event dispatch, threshold logic |
| `tests/loady.test.js` | Modify | Add tests for progress event and threshold |
| `README.md` | Modify | Document new event and attribute |

---

## Key Design Decisions

**Progress value:** `Math.round((loadedCount / totalCount) * 85)` during loading. Capped at 85 to match existing counter behavior. Snaps to 100 when exit animation begins.

**Phase values:** `'loading'` while assets resolve, `'min-wait'` after threshold crossed but `data-loady-min` not elapsed, `'animating'` at exit start (percent = 100, fires once).

**Asset detection:** `img` (check `.complete` for cached), `iframe`, `video[src]`, `script[src]`. Load/error listeners on all. `window.load` kept as fallback.

**Tick loop:** Refactored from time-based to asset-based. Runs at ~30fps (existing cadence) regardless of whether `counterEl` exists, because the event must always fire.

---

### Task 1: Asset Tracking + pageLoady:progress Event

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for the progress event**

Append to `tests/loady.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — no `pageLoady:progress` events dispatched.

- [ ] **Step 3: Add progress state variables to `src/loady.js`**

After `var barEl = loader.querySelector('[data-loady-bar]');` (line 87), add:

```js
    var percent = 0;
    var phase = 'loading';
    var loadedCount = 0;
    var totalCount = 0;
```

- [ ] **Step 4: Replace `startCounter` with asset-driven `startProgress`**

Replace the entire `startCounter` function (lines 196–231) with:

```js
    function startProgress() {
      var fps = 30;
      var interval = 1000 / fps;

      function tick() {
        if (counterDone) {
          renderComplete();
          return;
        }

        var val = Math.min(percent, 85);

        if (counterEl) counterEl.textContent = val + '%';
        if (barEl) barEl.style.width = val + '%';

        window.dispatchEvent(new CustomEvent('pageLoady:progress', {
          detail: {
            percent: val,
            raw: +(val / 100).toFixed(4),
            phase: phase,
          },
        }));

        requestAnimationFrame(function () {
          setTimeout(tick, interval);
        });
      }

      if (counterEl) counterEl.textContent = '0%';
      tick();
    }
```

- [ ] **Step 5: Add asset tracking functions**

After `startProgress`, add:

```js
    function onAssetResolved() {
      loadedCount++;
      if (totalCount === 0) {
        percent = 85;
      } else {
        percent = Math.round((loadedCount / totalCount) * 85);
      }
    }

    function initAssetTracking() {
      var assets = document.querySelectorAll('img, iframe, video[src], script[src]');
      totalCount = assets.length;

      if (totalCount === 0) {
        percent = 85;
        return;
      }

      for (var i = 0; i < assets.length; i++) {
        (function (el) {
          if (el.tagName === 'IMG' && el.complete) {
            onAssetResolved();
            return;
          }
          el.addEventListener('load', onAssetResolved);
          el.addEventListener('error', onAssetResolved);
        })(assets[i]);
      }
    }
```

- [ ] **Step 6: Update the call site from `startCounter()` to `startProgress()` + `initAssetTracking()`**

Replace the line `startCounter();` (line 92) with:

```js
    startProgress();
    initAssetTracking();
```

- [ ] **Step 7: Add final progress dispatch in `animateOut()`**

At the top of `animateOut()`, before `snapCounterTo100();` (line 152), add:

```js
      phase = 'animating';
      percent = 100;
      window.dispatchEvent(new CustomEvent('pageLoady:progress', {
        detail: { percent: 100, raw: 1, phase: 'animating' },
      }));
```

- [ ] **Step 8: Add final progress dispatch in `finishImmediately()`**

At the top of `finishImmediately()`, before `resumeGSAP();` (line 186), add:

```js
      phase = 'animating';
      window.dispatchEvent(new CustomEvent('pageLoady:progress', {
        detail: { percent: 100, raw: 1, phase: 'animating' },
      }));
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: All progress event tests PASS, all existing tests still PASS.

- [ ] **Step 10: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add pageLoady:progress event with asset tracking"
```

---

### Task 2: data-loady-threshold Attribute

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for threshold**

Append to `tests/loady.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — threshold attribute is not read, no threshold-based triggering.

- [ ] **Step 3: Add threshold attribute reading**

After the `var easing = ...` line (line 80), add:

```js
    var thresholdVal = parseFloat(loader.getAttribute('data-loady-threshold'));
    var threshold = (isNaN(thresholdVal) || thresholdVal <= 0 || thresholdVal > 1) ? 1 : thresholdVal;
```

- [ ] **Step 4: Add threshold check in `onAssetResolved`**

Replace the `onAssetResolved` function (added in Task 1) with:

```js
    function onAssetResolved() {
      loadedCount++;
      if (totalCount === 0) {
        percent = 85;
      } else {
        percent = Math.round((loadedCount / totalCount) * 85);
      }
      if (totalCount > 0 && (loadedCount / totalCount) >= threshold) {
        removeLoader('Threshold');
      }
    }
```

- [ ] **Step 5: Add threshold check for zero-asset case in `initAssetTracking`**

Replace the `if (totalCount === 0)` block in `initAssetTracking` with:

```js
      if (totalCount === 0) {
        percent = 85;
        removeLoader('No Assets');
        return;
      }
```

- [ ] **Step 6: Set phase to `'min-wait'` in `removeLoader` when min time remains**

Inside `removeLoader`, after `var remaining = Math.max(0, minTime - elapsed);` (line 146), add:

```js
      if (remaining > 0) phase = 'min-wait';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: All threshold tests PASS, all existing tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add data-loady-threshold for partial asset loading"
```

---

### Task 3: Update README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add `data-loady-threshold` to the Data Attribute API table**

In the Data Attribute API table, add a row after `data-loady-debug`:

```markdown
| `data-loady-threshold` | `1.0` | Fraction of tracked assets (0.0–1.0) that must resolve before exit begins. `1.0` = all assets (default). |
```

- [ ] **Step 2: Add `pageLoady:progress` to the Events table**

In the Events table, add a row after `pageLoady:finished`:

```markdown
| `pageLoady:progress` | Dispatched on `window` at ~30fps during load. `detail: { percent, raw, phase }`. Phase is `loading`, `min-wait`, or `animating`. |
```

- [ ] **Step 3: Add a new section for the progress event**

After the "GSAP & Webflow IX2 Auto-Pause" section, add:

```markdown
## Progress Event

`pageLoady:progress` fires on `window` during loading, exposing real-time progress for external renderers (Lottie, SVG, canvas, Three.js):

```js
window.addEventListener('pageLoady:progress', ({ detail }) => {
  console.log(detail.percent);  // 0–100 integer
  console.log(detail.raw);      // 0.0–1.0 float
  console.log(detail.phase);    // 'loading' | 'min-wait' | 'animating'
});
```

The event shares the same internal progress value as `data-loady-counter` and `data-loady-bar`. Progress is capped at 85% during loading and snaps to 100% when the exit animation begins.

Tracked assets: `img`, `iframe`, `video[src]`, `script[src]`.
```

- [ ] **Step 4: Add a Features bullet**

In the Features list, add after the "GSAP & IX2 auto-pause" bullet:

```markdown
- **Progress event** — `pageLoady:progress` exposes real-time loading progress for custom renderers
- **Threshold loading** — `data-loady-threshold` exits early when a fraction of assets have loaded
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document pageLoady:progress event and data-loady-threshold"
```

---

### Task 4: Build and Final Verification

**Files:**
- Build output: `dist/loady.js`, `dist/loady.min.js`, `dist/loady.esm.js`, `dist/loady.esm.min.js`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests PASS (existing + progress event + threshold).

- [ ] **Step 2: Build all dist formats**

Run: `npm run build`
Expected: 4 files output to `dist/` with no errors.

- [ ] **Step 3: Verify the build includes the new code**

Run: `grep -c "pageLoady:progress\|initAssetTracking\|onAssetResolved\|threshold" dist/loady.js`
Expected: A count > 0 confirming new code is in the bundle.

- [ ] **Step 4: Commit dist files**

```bash
git add dist/
git commit -m "build: rebuild dist with progress event and threshold"
```
