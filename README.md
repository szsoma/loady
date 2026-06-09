# Loady

FOUC-free page loader orchestrator for GSAP-powered websites. Drop it in, configure with data attributes, ship it.

**~2KB minified, zero dependencies.**

## How it works

1. Paste the CSS in `<head>` to hide elements and lock scroll instantly (no FOUC).
2. Add a loader element with `data-loady="container"`.
3. Drop the script on your page. It waits for assets to load, plays an exit animation, then dispatches `pageLoady:finished`.
4. Your GSAP code listens for that event and starts your animations.

## Installation

### 1. Add the CSS to `<head>`

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/szsoma/loady/loady.css">
```

This snippet:
- Hides elements with `[data-gsap-hide]` until animations are ready
- Locks `overflow` on `body` while the loader is active
- Positions the loader fixed full-screen with maximum z-index

### 2. Add the script

```html
<script src="https://cdn.jsdelivr.net/gh/szsoma/loady/dist/loady.min.js"></script>
```

### 3. Mark up your loader

```html
<div data-loady="container" data-loady-anim="slide-up" data-loady-min="1200">
  <div class="my-loader">Loading...</div>
  <span data-loady-counter>0%</span>
</div>
```

### 4. Hook up GSAP

```html
<script>
  window.addEventListener('pageLoady:finished', function () {
    gsap.set('[data-gsap-hide]', { autoAlpha: 1 });
    gsap.from('.hero-heading', { y: 50, opacity: 0, duration: 1 });
  });
</script>
```

## Data Attribute API

| Attribute | Default | Description |
|---|---|---|
| `data-loady="container"` | — | Identifies the loader wrapper (required) |
| `data-loady-anim` | `slide-up` | Exit animation: `fade`, `slide-up`, `slide-down` |
| `data-loady-duration` | `0.6` | Exit animation duration in seconds |
| `data-loady-failsafe` | `8000` | Max wait in ms before force-dismissing the loader |
| `data-loady-min` | `1500` | Minimum display time in ms (prevents flash on cached pages) |
| `data-loady-counter` | — | Animate a child element from 0% to 85% (snaps to 100% on load) |
| `data-loady-ignore` | — | CSS selector for links that should skip the loader on next navigation |

## Events

| Event | Description |
|---|---|
| `pageLoady:finished` | Dispatched on `window` when the loader has fully exited. This is your signal to start GSAP animations. |

## Features

- **Anti-FOUC CSS** — synchronous `<head>` snippet prevents the 0.1s flash of unstyled content
- **Event-driven handoff** — no coupling to GSAP internals; your code just listens for `pageLoady:finished`
- **Exit animations** — fade, slide-up, slide-down via CSS transitions (extensible by adding CSS)
- **Failsafe timeout** — configurable max wait so the loader can't hang indefinitely
- **Minimum display time** — prevents flicker on cached pages that load in milliseconds
- **Progress counter** — lightweight 0%→85% eased counter, snaps to 100% when loading completes
- **Ignore links** — excludes anchor links (`#section`), mailto, or any selector from triggering the loader
- **Accessible** — sets `aria-busy="true"` on body, restores on finish
- **Zero dependencies** — pure vanilla JS, works with any framework or none

## Development

```sh
npm install
npm run build       # Build dist/ files
npm run dev         # Watch mode
```

Outputs four bundle formats to `dist/`:
| File | Format |
|---|---|
| `loady.js` | IIFE (unminified) |
| `loady.min.js` | IIFE (minified) |
| `loady.esm.js` | ESM (unminified) |
| `loady.esm.min.js` | ESM (minified) |

## Demo

Open `demo/index.html` in a local server:

```sh
npx serve .
```

## License

MIT
