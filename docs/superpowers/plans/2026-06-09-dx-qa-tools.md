# DX & QA Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 developer experience features to Loady: URL bypass, session-based run-once, debug console logger, and a MutationObserver for dynamically injected CMS elements.

**Architecture:** All features are added to `src/loady.js` as early-return guards and conditional logic inside the existing `DOMContentLoaded` handler. The click listener for ignore-links remains unchanged. Testing uses vitest with jsdom, dynamically importing the script per test to get fresh module scope.

**Tech Stack:** Vanilla JS (IIFE), vitest, jsdom, rollup (existing)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/loady.js` | Modify | Add bypass, run-once, debug, and MutationObserver logic |
| `tests/loady.test.js` | Create | All unit tests for new and existing features |
| `demo/index.html` | Modify | Add `data-loady-once`, `data-loady-debug` to demo loader |
| `README.md` | Modify | Document new data attributes |
| `package.json` | Modify | Add vitest devDependency and test script |

---

### Task 1: Set Up Test Infrastructure

**Files:**
- Modify: `package.json`
- Create: `tests/loady.test.js`

- [ ] **Step 1: Install vitest and jsdom**

```bash
npm install --save-dev vitest jsdom
```

- [ ] **Step 2: Add test script and vitest config to package.json**

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.js` at project root:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 3: Write a smoke test to verify the setup works**

Create `tests/loady.test.js`:

```javascript
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
```

- [ ] **Step 4: Run tests to verify setup**

```bash
npm test
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.js tests/loady.test.js package-lock.json
git commit -m "chore: add vitest + jsdom test setup"
```

---

### Task 2: URL Parameter Bypass (`?noloader=true`)

**Files:**
- Modify: `src/loady.js:6-14`
- Modify: `tests/loady.test.js`

- [ ] **Step 1: Write failing tests for URL bypass**

Append to `tests/loady.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: The bypass test FAILS (loader still runs despite `?noloader=true`).

- [ ] **Step 3: Implement URL bypass in src/loady.js**

In `src/loady.js`, add the bypass check immediately after the loader element is found (after line 8, before the sessionStorage ignore check):

```javascript
    var loader = document.querySelector('[data-loady="container"]');
    if (!loader) return;

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('noloader') === 'true') {
      loader.style.display = 'none';
      document.body.removeAttribute('data-loady-status');
      document.body.removeAttribute('aria-busy');
      window.dispatchEvent(new CustomEvent('pageLoady:finished'));
      return;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add ?noloader=true URL bypass"
```

---

### Task 3: Session Storage Run-Once (`data-loady-once="true"`)

**Files:**
- Modify: `src/loady.js:16-19`
- Modify: `tests/loady.test.js`

- [ ] **Step 1: Write failing tests for run-once**

Append to `tests/loady.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: Run-once tests FAIL.

- [ ] **Step 3: Implement run-once in src/loady.js**

Add after the URL bypass check and before the existing `sessionStorage.getItem(IGNORE_KEY)` check:

```javascript
    var runOnce = loader.getAttribute('data-loady-once') === 'true';
    if (runOnce && sessionStorage.getItem('loady:seen') === 'true') {
      loader.style.display = 'none';
      document.body.removeAttribute('data-loady-status');
      document.body.removeAttribute('aria-busy');
      window.dispatchEvent(new CustomEvent('pageLoady:finished'));
      return;
    }
    if (runOnce) {
      sessionStorage.setItem('loady:seen', 'true');
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add data-loady-once session run-once"
```

---

### Task 4: Debug Mode Console Logger (`data-loady-debug="true"`)

**Files:**
- Modify: `src/loady.js:21-22`
- Modify: `tests/loady.test.js`

- [ ] **Step 1: Write failing tests for debug mode**

Append to `tests/loady.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: Debug tests FAIL.

- [ ] **Step 3: Implement debug mode in src/loady.js**

Add the `isDebug` variable alongside the other config reads (after `minTime`):

```javascript
    var isDebug = loader.getAttribute('data-loady-debug') === 'true';
```

Add a `logDebug` function inside the DOMContentLoaded handler (after the config reads, before `startCounter()`):

```javascript
    function logDebug(triggerSource) {
      if (!isDebug) return;
      var timeTaken = ((performance.now() - perfStart) / 1000).toFixed(2);
      console.groupCollapsed('%c Loady Debug', 'background: #222; color: #bada55; padding: 4px; border-radius: 4px;');
      console.table({
        'Trigger Source': triggerSource,
        'Time Taken (s)': timeTaken,
        'Animation Type': animType,
        'Duration (s)': duration,
        'Failsafe (ms)': failsafeTime,
        'Min Display (ms)': minTime,
        'Run Once': runOnce,
      });
      console.groupEnd();
    }
```

Add `var perfStart = performance.now();` right after `var startTime = Date.now();`.

Call `logDebug('Window Load')` inside `removeLoader()` (after `isLoaded = true`), and `logDebug('Failsafe')` — to differentiate, wrap the failsafe setTimeout callback:

Replace the existing `setTimeout(removeLoader, failsafeTime);` at the bottom with:

```javascript
    window.addEventListener('load', function () {
      removeLoader('Window Load');
    });
    setTimeout(function () {
      removeLoader('Failsafe');
    }, failsafeTime);
```

Update `removeLoader` to accept the trigger source:

```javascript
    function removeLoader(triggerSource) {
      if (isLoaded) return;
      isLoaded = true;
      logDebug(triggerSource);

      var elapsed = Date.now() - startTime;
      var remaining = Math.max(0, minTime - elapsed);

      setTimeout(animateOut, remaining);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add data-loady-debug console logger"
```

---

### Task 5: MutationObserver for Dynamically Injected Elements

**Files:**
- Modify: `src/loady.js` (add after the click listener, before the closing `})();`)
- Modify: `tests/loady.test.js`

- [ ] **Step 1: Write failing tests for MutationObserver**

Append to `tests/loady.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: MutationObserver tests FAIL.

- [ ] **Step 3: Implement MutationObserver in src/loady.js**

Add the following block after the existing click listener (line 135) and before the closing `})();`:

```javascript
  var observer = new MutationObserver(function (mutationsList) {
    for (var i = 0; i < mutationsList.length; i++) {
      var mutation = mutationsList[i];
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          var node = mutation.addedNodes[j];
          if (node.nodeType === 1) {
            if (node.hasAttribute('data-gsap-hide')) {
              node.style.visibility = 'hidden';
              node.style.opacity = '0';
            }
            var hiddenChildren = node.querySelectorAll('[data-gsap-hide]');
            for (var k = 0; k < hiddenChildren.length; k++) {
              hiddenChildren[k].style.visibility = 'hidden';
              hiddenChildren[k].style.opacity = '0';
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add MutationObserver for dynamically injected data-gsap-hide elements"
```

---

### Task 6: Update Demo Page

**Files:**
- Modify: `demo/index.html:36-41`

- [ ] **Step 1: Add new data attributes to the demo loader**

In `demo/index.html`, update the loader div (lines 36-41) to include the new attributes:

```html
  <div data-loady="container"
       data-loady-anim="fade"
       data-loady-duration="0.6"
       data-loady-failsafe="8000"
       data-loady-min="1500"
       data-loady-once="true"
       data-loady-debug="true"
       data-loady-ignore="a[href^='#'], a[href^='mailto:']">
```

- [ ] **Step 2: Verify demo loads correctly**

```bash
npx serve .
```

Open `http://localhost:3000/demo` in a browser. Verify:
- Loader shows with counter animating 0% to 100%
- Console shows the debug table
- Refreshing the page skips the loader (run-once)
- Adding `?noloader=true` to the URL skips the loader

- [ ] **Step 3: Commit**

```bash
git add demo/index.html
git commit -m "demo: add data-loady-once and data-loady-debug to demo"
```

---

### Task 7: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add new data attributes to the API table**

In the Data Attribute API table in `README.md`, add these rows after the existing `data-loady-ignore` row:

```markdown
| `data-loady-once` | `false` | Only show the loader once per browser tab session |
| `data-loady-debug` | `false` | Log performance metrics to the console on loader exit |
```

- [ ] **Step 2: Add URL bypass documentation**

Add a new section after the Events table:

```markdown
## URL Bypass

Append `?noloader=true` to any URL to skip the loader entirely. Useful during QA and staging reviews.
```

- [ ] **Step 3: Add MutationObserver to features list**

Add this row to the Features bullet list:

```markdown
- **MutationObserver** — auto-hides dynamically injected `[data-gsap-hide]` elements (CMS, infinite scroll)
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add DX features to README"
```

---

### Task 8: Build, Test, and Push

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Build dist files**

```bash
npm run build
```

Expected: 4 files created in `dist/` with no warnings.

- [ ] **Step 3: Commit dist and push**

```bash
git add -A
git commit -m "build: update dist with DX features"
git push
```
