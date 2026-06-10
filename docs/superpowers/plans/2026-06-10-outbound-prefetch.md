# Outbound Transitions & Hover Prefetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add outbound page transitions (loader re-enters before navigation) and hover prefetching (pre-fetch destination HTML on cursor intent) to Loady.

**Architecture:** A shared `isQualifyingLink()` function validates same-origin, non-hash, non-blank, non-ignored links. A single delegated `click` handler replaces the existing ignore-list handler: if the link is ignored, it sets sessionStorage and lets the browser navigate; if it qualifies and outbound is configured, it prevents default, animates the loader back in, then navigates. A separate `mouseover` handler injects `<link rel="prefetch">` after an 80ms intent delay. A `pageshow` handler restores state on bfcache back-navigation.

**Tech Stack:** Vanilla JS (IIFE/ESM), vitest, jsdom, rollup (all existing)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/loady.js` | Modify | Add `isQualifyingLink`, outbound click handler, prefetch, pageshow handler |
| `tests/loady.test.js` | Modify | Add tests for outbound, prefetch, and pageshow |
| `README.md` | Modify | Document new attributes |

---

## Key Design Decisions

**Single click handler:** The existing `data-loady-ignore` click handler is replaced by a combined handler that checks ignore list first, then outbound. This prevents double-registration and conflicting `preventDefault` calls.

**Outbound animation reuses CSS transitions:** The loader's in-animation uses the same `transition` + property approach as the exit animation. No new animation engine.

**`transitionend` + failsafe:** Navigation fires on `transitionend`. A failsafe timer (`duration * 1000 + 500ms`) forces navigation if the event never fires.

**Prefetch is passive:** `<link rel="prefetch" as="document">` is injected into `<head>`. Deduplication via DOM query. Suppressed on slow connections. No touch prefetching.

---

### Task 1: isQualifyingLink Helper

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for isQualifyingLink**

Append to `tests/loady.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — no outbound click handler exists.

- [ ] **Step 3: Add `isQualifyingLink` function and outbound config reading**

In `src/loady.js`, after the `var threshold = ...` line (line 85), add:

```js
    var outboundAnim = loader.getAttribute('data-loady-outbound');
    var prefetchEnabled = loader.getAttribute('data-loady-prefetch') === 'true';
    var ignoreList = loader.getAttribute('data-loady-ignore');

    function isQualifyingLink(anchor) {
      if (!anchor || anchor.tagName !== 'A') return false;
      if (!anchor.href || anchor.href === '') return false;
      if (anchor.target && anchor.target !== '_self') return false;
      if (anchor.getAttribute('href').charAt(0) === '#') return false;
      if (anchor.href === window.location.href) return false;
      try {
        var url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return false;
      } catch (e) {
        return false;
      }
      if (ignoreList && anchor.matches(ignoreList)) return false;
      return true;
    }
```

- [ ] **Step 4: Run the "does not intercept when outbound is not configured" test to verify it passes**

Run: `npm test -- -t "does not intercept when outbound"`
Expected: PASS (the handler isn't registered yet, so clicks pass through).

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add isQualifyingLink helper for outbound transitions"
```

---

### Task 2: Outbound Click Interception + Animation

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for outbound animation and navigation**

Append to `tests/loady.test.js`:

```js
describe('Outbound transitions (data-loady-outbound)', () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — no outbound handler, no navigation.

- [ ] **Step 3: Replace existing ignore-list click handler with combined handler**

In `src/loady.js`, replace the entire `ignoreList` block (lines 303–311):

```js
    var ignoreList = loader.getAttribute('data-loady-ignore');
    if (ignoreList) {
      document.addEventListener('click', function (e) {
        var target = e.target.closest(ignoreList);
        if (target) {
          sessionStorage.setItem(IGNORE_KEY, '1');
        }
      });
    }
```

With:

```js
    if (ignoreList || outboundAnim) {
      document.addEventListener('click', function (e) {
        var anchor = e.target.closest('a');
        if (!anchor) return;

        if (ignoreList && anchor.matches(ignoreList)) {
          sessionStorage.setItem(IGNORE_KEY, '1');
          return;
        }

        if (!outboundAnim || !isQualifyingLink(anchor)) return;

        e.preventDefault();
        var destinationUrl = anchor.href;

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

        var navigated = false;
        var failsafe = setTimeout(function () {
          if (!navigated) {
            navigated = true;
            window.location.href = destinationUrl;
          }
        }, (duration * 1000) + 500);

        loader.addEventListener('transitionend', function () {
          if (!navigated) {
            navigated = true;
            clearTimeout(failsafe);
            window.location.href = destinationUrl;
          }
        }, { once: true });
      });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All outbound transition tests PASS, all existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add outbound click interception and animation"
```

---

### Task 3: pageshow / bfcache Handler

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for pageshow handler**

Append to `tests/loady.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- -t "pageshow"`
Expected: FAIL — no pageshow handler exists.

- [ ] **Step 3: Add pageshow handler**

In `src/loady.js`, after the `setTimeout(function () { removeLoader('Failsafe'); }, failsafeTime);` block (near the end of the DOMContentLoaded callback, before the closing `});`), add:

```js
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        loader.style.display = 'none';
        document.body.style.overflow = '';
        document.body.removeAttribute('data-loady-status');
        document.body.removeAttribute('aria-busy');
        window.dispatchEvent(new CustomEvent('pageLoady:finished'));
      }
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- -t "pageshow"`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add pageshow handler for bfcache restoration"
```

---

### Task 4: Hover Prefetch

**Files:**
- Modify: `src/loady.js`
- Modify: `tests/loady.test.js` (append)

- [ ] **Step 1: Write failing tests for hover prefetch**

Append to `tests/loady.test.js`:

```js
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

    delete navigator.connection;
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

    delete navigator.connection;
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- -t "prefetch"`
Expected: FAIL — no prefetch logic exists.

- [ ] **Step 3: Add prefetch function and mouseover handler**

In `src/loady.js`, after the combined click handler block (added in Task 2), add:

```js
    if (prefetchEnabled) {
      function prefetch(url) {
        if (document.querySelector('link[rel="prefetch"][href="' + url + '"]')) return;
        var link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = 'document';
        document.head.appendChild(link);
      }

      document.addEventListener('mouseover', function (e) {
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

        anchor.addEventListener('mouseleave', function () {
          clearTimeout(timer);
        }, { once: true });
      });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- -t "prefetch"`
Expected: All prefetch tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS (existing + outbound + pageshow + prefetch).

- [ ] **Step 6: Commit**

```bash
git add src/loady.js tests/loady.test.js
git commit -m "feat: add hover prefetch with connection awareness"
```

---

### Task 5: Update README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add `data-loady-outbound` to the Data Attribute API table**

In the Data Attribute API table, add a row after `data-loady-ix2`:

```markdown
| `data-loady-outbound` | *(omitted)* | Enables outbound transitions. Value is the in-animation for the loader re-entrance: `fade`, `slide-up`, `slide-down`. Omit to disable. |
```

- [ ] **Step 2: Add `data-loady-prefetch` to the Data Attribute API table**

Add a row after `data-loady-outbound`:

```markdown
| `data-loady-prefetch` | `false` | Enables hover prefetch. After 80ms of cursor dwell on a qualifying internal link, injects `<link rel="prefetch">`. Suppressed on `saveData` and slow connections. |
```

- [ ] **Step 3: Add a new section for outbound transitions**

After the "Progress Event" section, add:

```markdown
## Outbound Transitions

When `data-loady-outbound` is set, Loady intercepts same-origin link clicks, animates the loader back in, then navigates. This creates a seamless transition between pages.

```html
<div data-loady="container" data-loady-anim="slide-up" data-loady-outbound="slide-down">
  ...
</div>
```

The outbound in-animation (`data-loady-outbound`) is independent of the exit animation (`data-loady-anim`). A failsafe forces navigation if the animation stalls.

Qualifying links: same-origin, not `target="_blank"`, not hash-only, not matching `data-loady-ignore`, not the current page.

### Back Button

Loady listens for `pageshow` with `event.persisted` to handle bfcache restoration — the loader is force-hidden and `pageLoady:finished` is dispatched.
```

- [ ] **Step 4: Add a new section for hover prefetch**

After the "Outbound Transitions" section, add:

```markdown
## Hover Prefetch

When `data-loady-prefetch="true"` is set, Loady prefetches the destination HTML after 80ms of cursor dwell on a qualifying link. By the time the user clicks and the outbound animation finishes, the next page is already cached.

```html
<div data-loady="container" data-loady-prefetch="true" data-loady-outbound="fade">
  ...
</div>
```

Prefetching is suppressed on `saveData` and slow connections (`2g`, `slow-2g`). Touch devices are excluded. Each URL is prefetched at most once per page session.
```

- [ ] **Step 5: Add Features bullets**

In the Features list, add after the "Threshold loading" bullet:

```markdown
- **Outbound transitions** — `data-loady-outbound` animates the loader back in before navigating to the next page
- **Hover prefetch** — `data-loady-prefetch` pre-fetches destination HTML for near-instant page loads
- **bfcache handling** — `pageshow` listener restores page state on back/forward navigation
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document outbound transitions and hover prefetch"
```

---

### Task 6: Build and Final Verification

**Files:**
- Build output: `dist/loady.js`, `dist/loady.min.js`, `dist/loady.esm.js`, `dist/loady.esm.min.js`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests PASS (existing + outbound + pageshow + prefetch).

- [ ] **Step 2: Build all dist formats**

Run: `npm run build`
Expected: 4 files output to `dist/` with no errors.

- [ ] **Step 3: Verify the build includes the new code**

Run: `rg -c "isQualifyingLink|outboundAnim|prefetch|pageshow" dist/loady.js`
Expected: A count > 0 confirming new code is in the bundle.

- [ ] **Step 4: Commit dist files**

```bash
git add dist/
git commit -m "build: rebuild dist with outbound transitions and prefetch"
```
