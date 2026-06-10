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
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/szsoma/loady@main/loady.css">
```

If you've tagged a release, replace `@main` with the version (e.g. `@1.0.0`).

This snippet:
- Hides elements with `[data-gsap-hide]` until animations are ready
- Locks `overflow` on `body` while the loader is active
- Positions the loader fixed full-screen with maximum z-index

### 2. Add the script before `</body>`

```html
<script src="https://cdn.jsdelivr.net/gh/szsoma/loady@main/dist/loady.min.js"></script>
</body>
```

If you've tagged a release, replace `@main` with the version (e.g. `@1.0.0`).

jsDelivr caches files aggressively. To purge a cached file after a push, open this URL in your browser: `https://purge.jsdelivr.net/gh/szsoma/loady@main/dist/loady.min.js`.

#### ESM usage

For module-based setups, import the ESM build instead:

```html
<script type="module">
  import 'https://cdn.jsdelivr.net/gh/szsoma/loady@main/dist/loady.esm.min.js';
</script>
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
| `data-gsap-hide` | — | Add to any element to hide it until `pageLoady:finished` fires (set via CSS, auto-hidden for dynamically injected nodes too) |
| `data-loady-anim` | `fade` | Exit animation: `fade`, `slide-up`, `slide-down` |
| `data-loady-easing` | `ease-in-out` | CSS easing function for the exit animation. See hint: https://easings.net (e.g. `linear`, `ease`, `cubic-bezier(...)`) |
| `data-loady-duration` | `0.5` | Exit animation duration in seconds |
| `data-loady-failsafe` | `5000` | Max wait in ms before force-dismissing the loader |
| `data-loady-min` | `0` | Minimum display time in ms (prevents flash on cached pages) |
| `data-loady-counter` | — | Animate a child element from 0% to 85% (snaps to 100% on load) |
| `data-loady-bar` | — | Target a child element to sync its width with the progress |
| `data-loady-ignore` | — | CSS selector for links that should skip the loader on next navigation |
| `data-loady-once` | `false` | Only show the loader once per tab session (uses `sessionStorage`; resets when the tab closes) |
| `data-loady-debug` | `false` | Log performance metrics to the console on loader exit |
| `data-loady-threshold` | `1.0` | Fraction of tracked assets (0.0–1.0) that must resolve before exit begins. `1.0` = all assets (default). |
| `data-loady-gsap` | `true` | Set to `false` to skip auto-pausing GSAP's `globalTimeline` during load |
| `data-loady-ix2` | `true` | Set to `false` to skip auto-pausing Webflow IX2 interactions during load |

## Events

| Event | Description |
|---|---|
| `pageLoady:finished` | Dispatched on `window` when the loader has fully exited. This is your signal to start GSAP animations. |
| `pageLoady:progress` | Dispatched on `window` at ~30fps during load. `detail: { percent, raw, phase }`. Phase is `loading`, `min-wait`, or `animating`. |

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

## URL Bypass

Append `?noloader=true` to any URL to skip the loader entirely. Useful during QA and staging reviews.

## Features

- **Anti-FOUC CSS** — synchronous `<head>` snippet prevents the 0.1s flash of unstyled content
- **Event-driven handoff** — no coupling to GSAP internals; your code just listens for `pageLoady:finished`
- **Exit animations** — fade, slide-up, slide-down via CSS transitions (extensible by adding CSS)
- **Failsafe timeout** — configurable max wait so the loader can't hang indefinitely
- **Minimum display time** — prevents flicker on cached pages that load in milliseconds
- **Progress counter** — lightweight 0%→85% eased counter, snaps to 100% when loading completes
- **Ignore links** — excludes anchor links (`#section`), mailto, or any selector from triggering the loader
- **Accessible** — sets `aria-busy="true"` on body, restores on finish
- **MutationObserver** — auto-hides dynamically injected `[data-gsap-hide]` elements (CMS, infinite scroll)
- **GSAP & IX2 auto-pause** — detects and pauses GSAP timelines and Webflow IX2 interactions during load, resumes on finish
- **Progress event** — `pageLoady:progress` exposes real-time loading progress for custom renderers
- **Threshold loading** — `data-loady-threshold` exits early when a fraction of assets have loaded
- **Zero dependencies** — pure vanilla JS, works with any framework or none

## Development

```sh
npm install
npm run build       # Build dist/ files
npm run dev         # Watch mode
npm test            # Run tests
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
