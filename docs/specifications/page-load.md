# Loady Feature Specification

## `data-loady-view-transition`

### Overview

An optional progressive enhancement layer that delegates the between-pages visual transition to the browser's native View Transition API instead of Loady's CSS animation system. When supported, this produces GPU-composited, stutter-free transitions with no JS timing coordination. When unsupported, Loady falls back to its existing outbound animation silently — zero breakage, zero configuration.

Requires `data-loady-outbound` to be set. View transitions handle the *between-pages* moment; Loady still owns the entrance sequence on the new page.

---

### Attribute

```html
<div
  data-loady="container"
  data-loady-outbound="slide-down"
  data-loady-view-transition="true"
>
```

| Value | Behaviour |
|---|---|
| `true` | Use View Transition API if supported, fall back to CSS animation if not |
| `false` / omitted | Always use CSS animation (existing behaviour) |

---

### Internal Decision Tree

```
outbound click intercepted
  →  is data-loady-view-transition="true"?
        NO  →  existing CSS outbound animation → navigate
        YES →  is document.startViewTransition supported?
                  NO  →  existing CSS outbound animation → navigate
                  YES →  document.startViewTransition(() => navigate)
                         CSS controls visuals via ::view-transition-* pseudos
  →  new page loads
  →  Loady entrance sequence runs (unchanged)
  →  pageLoady:finished fires
  →  GSAP / IX2 code runs
```

The fallback path is byte-for-byte identical to the non-view-transition outbound flow. No state difference, no timing difference.

---

### Two Visual Strategies

`data-loady-view-transition` accepts an optional strategy value that controls *what* gets transitioned.

```html
data-loady-view-transition="true"           <!-- strategy: crossfade (default) -->
data-loady-view-transition="persistent"     <!-- strategy: persistent loader -->
```

---

#### Strategy A — `true` (Crossfade)

The browser captures the full current page, navigates, captures the new page, and crossfades between them. Loady adds custom `::view-transition-*` keyframes to `loady.css` that replace the default crossfade with motion that matches the configured `data-loady-anim` style.

```css
/* loady.css — added automatically when view transition is active */

@view-transition {
  navigation: auto; /* enables cross-document transitions as bonus */
}

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
```

`--loady-duration` and `--loady-easing` are CSS custom properties Loady already writes to the container — the view transition keyframes inherit them automatically, keeping duration and easing consistent with the rest of the configuration.

The loader overlay itself is **not visible** during this strategy. The transition is a full-page morph. The loader's entrance sequence still runs normally on the new page after navigation completes.

**Best for:** sites where the page content itself is the visual transition. Editorial sites, portfolios, landing pages.

---

#### Strategy B — `persistent`

The loader container is assigned a `view-transition-name`, making the browser treat it as a named, persistent element across the navigation boundary. On the outbound page it animates into view; on the inbound page the browser sees the same named element already present and morphs between its two states.

```css
/* Written by Loady's init script when strategy is persistent */
[data-loady="container"] {
  view-transition-name: loady-container;
  contain: layout;  /* required by the spec for named elements */
}
```

```js
// outbound handler
document.startViewTransition(() => {
  // Loader is already visible at this point (played in via CSS)
  window.location.href = destinationUrl;
});
```

On the new page, the browser renders the loader container as already in its "in" position (because the named element persisted), then Loady runs its normal exit sequence. The visual result: the loader feels physically continuous across the page boundary — like a native app shell sliding in and out.

**Constraint:** both pages must include the same `[data-loady="container"]` element. On a Webflow site this is always true if the loader is in a global symbol. On pages that intentionally omit the loader, the browser gracefully degrades to a standard crossfade.

**Best for:** sites where the loader is a strong brand element (full-screen colour block, logo reveal). The loader *is* the transition.

---

### `prefers-reduced-motion` Handling

When `prefers-reduced-motion: reduce` is active, Loady suppresses all keyframe animations and sets transition duration to `0ms` — both for its own CSS animations and for the view transition pseudos.

```css
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

Navigation still occurs. The loader still hides and shows. There is just no motion.

---

### `pageshow` / bfcache Interaction

The View Transition API does not fire when the browser restores a page from bfcache (back/forward navigation). The `pageshow` handler introduced in the outbound transitions spec remains the correct mechanism for that case — it is unaffected by this feature.

```js
// Unchanged from outbound transitions spec
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    loaderEl.style.display = 'none';
    document.body.style.overflow = '';
    window.dispatchEvent(new Event('pageLoady:finished'));
  }
});
```

---

### Cross-Document Bonus

When `data-loady-view-transition` is set, Loady also injects `@view-transition { navigation: auto; }` into the page. This means that any navigation *not* intercepted by Loady's click handler (e.g. form submissions, programmatic navigations, links excluded via `data-loady-ignore`) also gets a native crossfade transition in supporting browsers — for free, with no extra configuration.

This is a passive enhancement. It does not affect Loady's entrance sequence or `pageLoady:finished` timing.

---

### Conflict: Webflow IX2 Page Load Animations

Webflow's IX2 engine fires page load triggers on `DOMContentLoaded`. With view transitions active, the new page's `DOMContentLoaded` fires inside the transition — IX2 animations may start playing *while* the view transition is still mid-crossfade, causing a visual conflict.

The correct resolution is the same IX2 pause/resume pattern flagged elsewhere in this spec:

```js
// On new page load, before IX2 fires
const ix2 = window.Webflow?.require('ix2');
ix2?.destroy();

// Resume after Loady entrance sequence completes
window.addEventListener('pageLoady:finished', () => {
  ix2?.init();
});
```

When `data-loady-view-transition` is active, Loady should **automatically** apply this pattern without requiring a separate `data-loady-ix2` attribute. The View Transition timing makes the conflict reliable enough that it should be the default behaviour.

---

### Browser Support Behaviour Matrix

| Browser | `startViewTransition` | Experience |
|---|---|---|
| Chrome 111+ | ✅ | Full view transition |
| Firefox 131+ | ✅ | Full view transition |
| Safari 18+ | ✅ | Full view transition |
| Chrome < 111 | ❌ | CSS outbound animation fallback |
| Firefox < 131 | ❌ | CSS outbound animation fallback |
| Safari < 18 | ❌ | CSS outbound animation fallback |

As of June 2026, same-document `startViewTransition` has broad support across current browser versions. The fallback exists for older browsers and any environment where the API is unavailable.

---

### Data Attribute API Addition

| Attribute | Default | Description |
|---|---|---|
| `data-loady-view-transition` | *(omitted)* | Enables View Transition API for outbound navigation. `true` uses full-page crossfade strategy. `persistent` assigns a `view-transition-name` to the loader container for a continuous loader effect. Falls back to CSS animation if unsupported. Requires `data-loady-outbound`. |

---

### Updated Full Event Sequence

```
cursor rests on link (80ms)
  →  prefetch injected (if data-loady-prefetch="true")

user clicks
  →  click intercepted
  →  data-loady-view-transition supported?
        YES (crossfade)    →  document.startViewTransition(() => navigate)
                               browser captures current page
                               ::view-transition-old animates out
                               navigation executes
                               ::view-transition-new animates in
        YES (persistent)   →  loader animates in (CSS)
                               document.startViewTransition(() => navigate)
                               loader morphs across boundary
        NO                 →  loader animates in (CSS) → navigate

new page loads (likely from prefetch cache)
  →  IX2 destroyed (if Webflow detected)
  →  Loady entrance sequence runs
  →  pageLoady:finished fires
  →  IX2 reinitialised
  →  GSAP animations begin
```
