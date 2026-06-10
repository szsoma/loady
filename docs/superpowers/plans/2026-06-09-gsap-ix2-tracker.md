# GSAP & Webflow IX2 Auto-Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect GSAP and Webflow IX2 on the page, pause/destroy them while the loader is active, and resume/re-init them when the loader finishes — with opt-out attributes for each.

**Architecture:** Detection and pause/resume helpers are added to `src/loady.js` alongside existing logic. On loader init, GSAP's `globalTimeline` is paused and Webflow IX2 is destroyed. On loader finish (all exit paths), they are resumed/re-initialized. Opt-out is via `data-loady-gsap="false"` and `data-loady-ix2="false"` on the container element.

**Tech Stack:** Vanilla JS (IIFE/ESM), vitest, jsdom, rollup (all existing)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/loady.js` | Modify | Add GSAP/IX2 detection, pause, and resume logic |
| `tests/loady.test.js` | Modify | Add tests for GSAP and IX2 auto-pause behavior |
| `README.md` | Modify | Document new `data-loady-gsap` and `data-loady-ix2` attributes |

---

### Task 1: GSAP Auto-Pause and Resume

**Files:**
- Modify: `src/loady.js:1-212`
- Modify: `tests/loady.test.js:266` (append)

- [ ] **Step 1: Write failing tests for GSAP auto-pause**

Append to `tests/loady.test.js`:

```js
describe('GSAP auto-pause', () => {
  var mockGSAP;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `gsap.globalTimeline.pause` never called, `resume` never called, etc.

- [ ] **Step 3: Add GSAP pause/resume helpers to `src/loady.js`**

After the `SEEN_KEY` constant (line 5), add:

```js
  var gsapTL = null;

  function pauseGSAP() {
    if (window.gsap && window.gsap.globalTimeline) {
      gsapTL = window.gsap.globalTimeline;
      gsapTL.pause();
    }
  }

  function resumeGSAP() {
    if (gsapTL) {
      gsapTL.resume();
      gsapTL = null;
    }
  }
```

- [ ] **Step 4: Read `data-loady-gsap` attribute and call pauseGSAP on init**

After the line `document.body.setAttribute('aria-busy', 'true');` (line 52), add:

```js
    var skipGSAP = loader.getAttribute('data-loady-gsap') === 'false';
    if (!skipGSAP) pauseGSAP();
```

- [ ] **Step 5: Call resumeGSAP in `finish()`**

Inside the `finish()` function, after `observer.disconnect();` (line 139), add:

```js
      resumeGSAP();
```

So `finish()` becomes:

```js
    function finish() {
      observer.disconnect();
      resumeGSAP();
      cleanupLoader();
    }
```

- [ ] **Step 6: Call resumeGSAP in `finishImmediately()`**

Inside `finishImmediately()`, before `cleanupLoader();` (line 144), add:

```js
      resumeGSAP();
```

So `finishImmediately()` becomes:

```js
    function finishImmediately() {
      resumeGSAP();
      cleanupLoader();
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: All GSAP auto-pause tests PASS, all existing tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: auto-pause and resume GSAP globalTimeline during loader"
```

---

### Task 2: Webflow IX2 Auto-Pause and Resume

**Files:**
- Modify: `src/loady.js` (helpers section + init + finish paths)
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for IX2 auto-pause**

Append to `tests/loady.test.js`:

```js
describe('Webflow IX2 auto-pause', () => {
  var mockIx2;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-loady-status');
    document.body.removeAttribute('aria-busy');

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `ix2.destroy` never called, `ix2.init` never called, etc.

- [ ] **Step 3: Add IX2 pause/resume helpers to `src/loady.js`**

After the `resumeGSAP()` function (added in Task 1), add:

```js
  var ix2Engine = null;

  function pauseIX2() {
    if (window.Webflow && typeof window.Webflow.require === 'function') {
      ix2Engine = window.Webflow.require('ix2');
      if (ix2Engine) ix2Engine.destroy();
    }
  }

  function resumeIX2() {
    if (ix2Engine) {
      ix2Engine.init();
      ix2Engine = null;
    }
  }
```

- [ ] **Step 4: Read `data-loady-ix2` attribute and call pauseIX2 on init**

After the GSAP pause block added in Task 1 (the `if (!skipGSAP) pauseGSAP();` line), add:

```js
    var skipIX2 = loader.getAttribute('data-loady-ix2') === 'false';
    if (!skipIX2) pauseIX2();
```

- [ ] **Step 5: Call resumeIX2 in `finish()`**

Inside the `finish()` function, after `resumeGSAP();` (added in Task 1), add:

```js
      resumeIX2();
```

So `finish()` becomes:

```js
    function finish() {
      observer.disconnect();
      resumeGSAP();
      resumeIX2();
      cleanupLoader();
    }
```

- [ ] **Step 6: Call resumeIX2 in `finishImmediately()`**

Inside `finishImmediately()`, after `resumeGSAP();` (added in Task 1), add:

```js
      resumeIX2();
```

So `finishImmediately()` becomes:

```js
    function finishImmediately() {
      resumeGSAP();
      resumeIX2();
      cleanupLoader();
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: All IX2 auto-pause tests PASS, all existing tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: auto-pause and resume Webflow IX2 during loader"
```

---

### Task 3: Add GSAP/IX2 Status to Debug Output

**Files:**
- Modify: `src/loady.js` (the `logDebug` function)
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write a failing test for debug table entries**

Append to `tests/loady.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `tableArg['GSAP Paused']` is undefined.

- [ ] **Step 3: Add GSAP/IX2 status to the `logDebug` table**

In the `logDebug` function, add two new rows to the `console.table` object. After the `'Run Once': runOnce,` line, add:

```js
        'GSAP Paused': !skipGSAP && !!gsapTL,
        'IX2 Paused': !skipIX2 && !!ix2Engine,
```

Note: At the point `logDebug` is called (inside `removeLoader`), `gsapTL` and `ix2Engine` are still set (they get nulled in `resume*` which runs later in `finish()`). The `skipGSAP`/`skipIX2` booleans are in the closure scope.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All debug status tests PASS, all existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: show GSAP/IX2 pause status in debug output"
```

---

### Task 4: Update README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add new attributes to the Data Attribute API table**

In the Data Attribute API table in `README.md`, add two rows after the `data-loady-debug` row:

```markdown
| `data-loady-gsap` | `true` | Set to `false` to skip auto-pausing GSAP's `globalTimeline` during load |
| `data-loady-ix2` | `true` | Set to `false` to skip auto-pausing Webflow IX2 interactions during load |
```

- [ ] **Step 2: Add a new section explaining the auto-pause behavior**

After the "Events" section in `README.md`, add:

```markdown
## GSAP & Webflow IX2 Auto-Pause

Loady automatically detects and pauses GSAP and Webflow IX2 animations while the loader is active, preventing animation conflicts:

- **GSAP** — pauses `gsap.globalTimeline` on init, resumes on `pageLoady:finished`
- **Webflow IX2** — calls `destroy()` on the IX2 engine on init, re-initializes with `init()` on finish

Both are auto-detected and paused by default. To opt out:

```html
<div data-loady="container" data-loady-gsap="false" data-loady-ix2="false">
  ...
</div>
```

- [ ] **Step 3: Add a Features bullet**

In the Features list, add after the "MutationObserver" bullet:

```markdown
- **GSAP & IX2 auto-pause** — detects and pauses GSAP timelines and Webflow IX2 interactions during load, resumes on finish
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document GSAP and Webflow IX2 auto-pause feature"
```

---

### Task 5: Build and Final Verification

**Files:**
- Build output: `dist/loady.js`, `dist/loady.min.js`, `dist/loady.esm.js`, `dist/loady.esm.min.js`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests PASS (existing + new GSAP + new IX2 + debug status).

- [ ] **Step 2: Build all dist formats**

Run: `npm run build`
Expected: 4 files output to `dist/` with no errors.

- [ ] **Step 3: Verify the build includes the new code**

Run: `grep -c "pauseGSAP\|pauseIX2\|resumeGSAP\|resumeIX2" dist/loady.js`
Expected: A count > 0 confirming the new functions are in the bundle.

- [ ] **Step 4: Commit dist files**

```bash
git add dist/
git commit -m "build: rebuild dist with GSAP/IX2 auto-pause"
```
