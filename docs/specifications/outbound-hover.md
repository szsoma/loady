# Loady Feature Specification

## 1. Outbound Page Transitions

### Overview

When a user clicks an internal link, the browser navigates immediately — the current page tears down, a white flash appears, and the new page starts loading from zero. Loady already owns the *entrance* side of this experience. Outbound transitions close the loop: intercept the click, animate the loader back in, *then* navigate. Combined with hover prefetching (spec §2), this creates a seamless perceived transition with near-zero load time on the next page.

---

### Attribute

```html
<div
  data-loady="container"
  data-loady-anim="slide-up"
  data-loady-outbound="slide-down"
>
```

**`data-loady-outbound`** — enables outbound transitions. Value is the **in-animation** used when the loader re-enters the screen before navigation.

| Value | Behavior |
|---|---|
| `slide-down` | Loader slides in from top (natural reverse of `slide-up` exit) |
| `slide-up` | Loader slides in from bottom |
| `fade` | Loader fades in |
| *(omitted)* | Outbound transitions disabled — existing behaviour |

The outbound in-animation is intentionally independent of the exit animation. A page might exit with `slide-up` and enter on the next load with `slide-up` again — those are different moments. Decoupling them gives full creative control.

---

### How It Works — Step by Step

**1. Click interception**

On `DOMContentLoaded`, Loady attaches a single delegated `click` listener to `document`. When a click occurs, it checks whether the target (or its closest ancestor `<a>`) qualifies as an internal navigation link.

A link qualifies if **all** of the following are true:
- It is an `<a>` element with a non-empty `href`
- `href` is same-origin (matches `window.location.origin`)
- It does not have `target="_blank"` or any non-`_self` target
- It is not a hash-only link (`href` starts with `#`)
- It does not match the `data-loady-ignore` selector (existing attribute)
- It is not the current page (`href` !== `window.location.href`)

If the link qualifies:
1. `event.preventDefault()` stops the browser from navigating
2. The destination URL is captured
3. The outbound animation sequence begins

**2. Outbound animation sequence**

```
click intercepted
  → event.preventDefault()
  → capture destinationUrl
  → set loader to visible (display: block or equivalent)
  → play in-animation (data-loady-outbound value)
  → on animationend / transitionend:
      → window.location.href = destinationUrl
```

The loader animates in using the same CSS transition system already used for exit animations — no new animation engine needed. The duration respects `data-loady-duration`.

**3. Navigation execution**

After `transitionend` fires on the loader container, Loady sets `window.location.href` to the captured destination. The browser navigates. The new page loads, Loady's entrance sequence runs as normal.

---

### Back Button Behaviour

The browser back button bypasses click interception entirely — it's a native navigation event. No special handling is needed for Loady's *outbound* side.

On the *incoming* side: when the user presses back, the browser restores the previous page from bfcache (back/forward cache) if available. The Loady entrance animation will **not** re-run in this case because the page is restored, not loaded fresh — `DOMContentLoaded` does not re-fire.

To handle this explicitly, Loady should listen for the `pageshow` event:

```js
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Page restored from bfcache (back/forward navigation)
    // Force-hide the loader immediately — no entrance animation
    loaderEl.style.display = 'none';
    document.body.style.overflow = '';
    // Dispatch pageLoady:finished so downstream GSAP listeners
    // still fire and the page is usable
    window.dispatchEvent(new Event('pageLoady:finished'));
  }
});
```

This ensures the page is never left in a locked/hidden state after a back navigation.

---

### Keyboard & Accessibility

- `Enter` on a focused `<a>` fires a `click` event natively — interception works automatically, no extra keydown handler needed.
- During the outbound animation, `aria-busy="true"` is set on `body` (same as the entrance sequence).
- The animation duration should stay short (≤ 600ms). Users on `prefers-reduced-motion` get an instant hide/show instead of the animation — same `matchMedia` check used elsewhere in Loady.

---

### Timeout Failsafe

If `transitionend` never fires (e.g. the element was display-none, CSS failed to load, or the animation was overridden), a failsafe timer forces navigation after `data-loady-duration * 1000 + 500ms`. Navigation must never be blocked indefinitely.

```js
const failsafe = setTimeout(() => {
  window.location.href = destinationUrl;
}, (duration * 1000) + 500);

loaderEl.addEventListener('transitionend', () => {
  clearTimeout(failsafe);
  window.location.href = destinationUrl;
}, { once: true });
```

---

### Data Attribute API Addition

| Attribute | Default | Description |
|---|---|---|
| `data-loady-outbound` | *(omitted)* | Enables outbound transitions. Value is the in-animation for the loader re-entrance: `fade`, `slide-up`, `slide-down`. Omit to disable. |

---

### What Loady Does NOT Do

- **No SPA routing** — Loady does not intercept `popstate`, manage a history stack, or cache page content. It performs a real browser navigation. Full page lifecycle, full Webflow IX2 reinit, no state management complexity.
- **No parallel fetch during transition** — that's hover prefetching's job (§2). Outbound transitions are purely visual; they assume the browser will handle caching.

---
---

## 2. Hover Prefetching

### Overview

The moment a user's cursor rests on a qualifying internal link, Loady injects a `<link rel="prefetch">` tag pointing at that URL. The browser fetches the HTML in the background at low priority, storing it in the HTTP cache. By the time the user clicks and the outbound animation finishes playing, the next page's HTML is already downloaded. The subsequent Loady entrance animation starts from a cached response — effectively zero perceived load time.

This is a passive, non-blocking enhancement. If prefetching fails or is unsupported, nothing breaks. It is invisible to the user and requires no markup changes.

---

### Attribute

```html
<div
  data-loady="container"
  data-loady-prefetch="true"
>
```

**`data-loady-prefetch`** — opt-in to hover prefetching.

| Value | Behaviour |
|---|---|
| `true` | Prefetch on hover after intent delay |
| `false` / omitted | Prefetching disabled (default) |

Prefetching is **opt-in** rather than opt-out. Prefetching generates real HTTP requests; enabling it by default could cause unexpected traffic on large sites, trigger analytics events, or conflict with server-side rate limiting.

---

### Intent Delay

Prefetching fires after the cursor has rested on a link for **80ms**, not on immediate `mouseenter`. This filters out accidental passes (cursor moving across the page) while still being fast enough to complete the fetch before a deliberate click.

```
mouseenter  →  start 80ms timer
mouseleave  →  cancel timer (if still pending)
80ms elapsed, cursor still on link  →  inject prefetch
click  →  outbound animation plays  →  navigate (response likely cached)
```

The 80ms value is not configurable in v1. It matches the value used by established prefetch libraries (instant.page, quicklink) and is backed by research on intent detection timing.

---

### Implementation

**Prefetch injection**

```js
function prefetch(url) {
  // Avoid duplicate prefetches
  const alreadyPrefetched = document.querySelector(`link[rel="prefetch"][href="${url}"]`);
  if (alreadyPrefetched) return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  link.as = 'document';
  document.head.appendChild(link);
}
```

**Event wiring** (single delegated listener, same pattern as click interception)

```js
document.addEventListener('mouseover', (event) => {
  const anchor = event.target.closest('a');
  if (!anchor || !isQualifyingLink(anchor)) return;

  const timer = setTimeout(() => prefetch(anchor.href), 80);
  anchor.addEventListener('mouseleave', () => clearTimeout(timer), { once: true });
});
```

`mouseover` bubbles (unlike `mouseenter`), making it suitable for delegation.

---

### Qualifying Links

Uses the exact same qualification logic as outbound click interception:
- Same-origin
- Not `target="_blank"`
- Not hash-only
- Not matching `data-loady-ignore`
- Not the current page URL

They share a single `isQualifyingLink()` internal function. No duplication.

---

### Connection Awareness

Prefetching is automatically suppressed under poor network conditions:

```js
const connection = navigator.connection;
const shouldSkip =
  connection?.saveData === true ||
  ['slow-2g', '2g'].includes(connection?.effectiveType);

if (shouldSkip) return;
```

| Condition | Behaviour |
|---|---|
| `navigator.connection.saveData === true` | Prefetching disabled (user explicitly requested reduced data) |
| `effectiveType` is `slow-2g` or `2g` | Prefetching disabled (prefetching on slow connections makes load *worse*, not better) |
| `3g`, `4g`, WiFi, or API unavailable | Prefetching proceeds normally |

`navigator.connection` is not universally supported. If unavailable, Loady prefetches unconditionally (fail open, not fail closed).

---

### Limits & Deduplication

- A given URL is prefetched **at most once per page session**. The injected `<link>` tag serves as the deduplication record — no separate Set needed.
- No cap on total number of distinct URLs prefetched. On pages with hundreds of links this is theoretically unbounded, but in practice users hover a small number of links per session.
- Loady does **not** prefetch on `touchstart` or mobile pointer events. Touch devices have different intent patterns and mobile data costs are a concern. Touch users still benefit from outbound transitions — they just don't get background prefetching.

---

### What Gets Prefetched

Only the HTML document at the destination URL. `<link rel="prefetch" as="document">` fetches the page HTML only — the browser does not speculatively fetch the linked page's CSS, JS, or images. This is intentional: those sub-resources are typically already cached from the current page visit (shared assets), and fetching everything would be too aggressive.

---

### Data Attribute API Addition

| Attribute | Default | Description |
|---|---|---|
| `data-loady-prefetch` | `false` | Enables hover prefetch. After 80ms of cursor dwell on a qualifying internal link, Loady injects `<link rel="prefetch" as="document">` for that URL. Suppressed on `saveData` and slow connections. |

---

## Combined Sequence (Both Features Active)

```
cursor rests on link for 80ms
  → <link rel="prefetch"> injected
  → browser fetches destination HTML in background (low priority)

user clicks link
  → click intercepted, event.preventDefault()
  → outbound in-animation plays (~400–600ms)
  → transitionend fires
  → window.location.href = destinationUrl
  → browser navigates (response served from prefetch cache)
  → new page loads — HTML already downloaded
  → Loady entrance sequence runs
  → pageLoady:finished fires
  → GSAP / IX2 animations begin
```

The prefetch window (hover → click) is typically 200ms–2000ms in real usage. A 400–600ms outbound animation adds additional buffer. On a standard connection, HTML for a typical Webflow page (50–200KB) downloads comfortably within that window.
