# Loady Feature Specification

## `pageLoady:progress` Event

### Overview
A custom event dispatched on `window` during the asset loading phase, mirroring the internal progress state that already drives `data-loady-counter` and `data-loady-bar`. This decouples progress reporting from the built-in UI elements and lets developers drive any external renderer — Lottie, SVG path, canvas, Three.js, whatever.

---

### Event Shape

```js
window.dispatchEvent(new CustomEvent('pageLoady:progress', {
  detail: {
    percent: 72,        // integer 0–100
    raw: 0.72,          // float 0.0–1.0
    phase: 'loading',   // 'loading' | 'min-wait' | 'animating'
  }
}));
```

**`percent`** — rounded integer, ready to display directly.

**`raw`** — unrounded float for smooth interpolation (Lottie frame seek, SVG stroke-dashoffset, etc.).

**`phase`** — tells listeners *why* progress is at a given value:
- `loading` — assets still resolving
- `min-wait` — assets done but `data-loady-min` hasn't elapsed yet; progress is being eased artificially toward 85%
- `animating` — loader exit is playing; percent is 100, event fires once as a final signal

---

### Dispatch Frequency

Fires on every internal tick — same cadence as the counter animation (~60fps via `requestAnimationFrame`). Consumers are responsible for their own throttling if needed.

A final dispatch with `percent: 100` and `phase: 'animating'` fires at the moment the exit animation begins, before `pageLoady:finished`.

---

### Usage Examples

**Lottie scrub**
```js
window.addEventListener('pageLoady:progress', ({ detail }) => {
  lottieInstance.goToAndStop(detail.raw * totalFrames, true);
});
```

**SVG circle stroke**
```js
const circle = document.querySelector('.progress-ring');
const circumference = 2 * Math.PI * circle.r.baseVal.value;

window.addEventListener('pageLoady:progress', ({ detail }) => {
  circle.style.strokeDashoffset = circumference * (1 - detail.raw);
});
```

**Vanilla counter (without `data-loady-counter`)**
```js
window.addEventListener('pageLoady:progress', ({ detail }) => {
  document.querySelector('.my-counter').textContent = detail.percent + '%';
});
```

---

### Interaction with Built-in Attributes

`pageLoady:progress` and `data-loady-counter` / `data-loady-bar` read from the **same internal progress value**. They are not mutually exclusive — you can use the event and the built-in counter simultaneously. The event just exposes what was previously private.

---

### Data Attribute API Addition

| Attribute | Default | Description |
|---|---|---|
| *(no new attribute)* | — | Event is always dispatched. No opt-in required. |

Rationale: the event is zero-cost to dispatch even if no listener exists. There's no reason to gate it behind an attribute.

---
---

## `data-loady-threshold`

### Overview

By default Loady waits for **all** tracked assets to resolve before dismissing. On pages with many heavy resources, one slow image or non-critical script shouldn't hold the entire experience hostage. `data-loady-threshold` lets you define the fraction of assets that must complete before Loady considers the page "ready."

---

### Attribute

```html
<div
  data-loady="container"
  data-loady-threshold="0.9"
>
```

**Type:** float string, `0.0`–`1.0`
**Default:** `1.0` (all assets must resolve — existing behavior, fully backwards compatible)

---

### Behavior

Loady tracks a set of "interesting" assets on the page (images, scripts, iframes — same as the current implementation). As each one resolves, the internal loaded count increments. The threshold check runs after each resolution:

```
loadedCount / totalCount >= threshold  →  trigger exit sequence
```

Once the threshold is crossed, the remaining unresolved assets are abandoned — Loady does not cancel them, they continue loading in the background normally. The loader just stops waiting.

---

### Edge Cases & Rules

**`0.0` is valid but useless** — the loader would exit immediately on the first asset resolution. No validation error, just documented behavior.

**`1.0` is the default** — explicit `data-loady-threshold="1.0"` is identical to omitting the attribute.

**Interaction with `data-loady-min`** — threshold and minimum display time are independent axes. Even if the threshold is crossed immediately, `data-loady-min` is still respected. The exit sequence starts at `max(thresholdCrossedAt, minElapsedAt)`.

**Interaction with `data-loady-failsafe`** — failsafe still applies. If the threshold is never crossed within the failsafe window (e.g. all assets fail to load), the failsafe forces dismissal as usual.

**Zero assets** — if Loady finds no trackable assets on the page, it behaves as if the threshold is immediately satisfied (same as current behavior).

**Threshold crossed at exactly 0% load (empty asset list)** — treated as immediate satisfaction, not as a division-by-zero edge case. `totalCount === 0` short-circuits the threshold check entirely.

---

### Progress Reporting Interaction

When a threshold below `1.0` is set, the `pageLoady:progress` counter and `data-loady-counter` / `data-loady-bar` elements still animate to **100%** — not to the threshold percentage. The loader should always appear to complete fully from the user's perspective. The threshold is an internal trigger, not a visual ceiling.

```
Threshold 0.9 → 90% of assets load → internal: "ready"
→ progress animates to 100% → exit animation plays
```

---

### Suggested Use Cases

| Scenario | Recommended threshold |
|---|---|
| Page with one known slow/non-critical asset | `0.9` |
| Heavy image gallery, load-as-you-scroll content | `0.75`–`0.85` |
| Aggressive: show page as soon as DOM-critical assets load | `0.5` |
| Default: wait for everything | `1.0` (omit attribute) |

---

### Data Attribute API Addition

| Attribute | Default | Description |
|---|---|---|
| `data-loady-threshold` | `1.0` | Fraction of tracked assets (0.0–1.0) that must resolve before the exit sequence begins. `1.0` = all assets (default behavior). |

---

## Event Ordering Summary

For clarity, here's the full event sequence with both features active:

```
page starts loading
  → pageLoady:progress fires at ~60fps  (phase: 'loading')
  → threshold crossed (if < 1.0)
  → data-loady-min wait (if set)
  → pageLoady:progress fires once       (phase: 'animating', percent: 100)
  → exit animation plays
  → pageLoady:finished fires
  → your GSAP / IX2 code runs
```
