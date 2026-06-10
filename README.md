# Loady

FOUC-free page loader orchestrator for GSAP-powered websites.

**~3.5 KB gzipped (JS + CSS), zero dependencies.**

## Table of Contents

- [Quickstart](#quickstart)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Loader Container](#loader-container)
  - [Animation](#animation)
  - [Timing](#timing)
  - [Progress Tracking](#progress-tracking)
  - [Link Handling](#link-handling)
  - [Outbound Transitions](#outbound-transitions)
  - [Prefetch](#prefetch)
  - [View Transitions](#view-transitions)
  - [Session Behavior](#session-behavior)
  - [Auto-Pause](#auto-pause)
  - [Debug](#debug)
- [Events](#events)
  - [pageLoady:finished](#pageloadyfinished)
  - [pageLoady:progress](#pageloadyprogress)
- [GSAP & Webflow IX2 Integration](#gsap--webflow-ix2-integration)
- [How Loaders Exit](#how-loaders-exit)
- [Back Button Behavior](#back-button-behavior)
- [URL Bypass](#url-bypass)
- [Features](#features)
- [Development](#development)
- [File Sizes](#file-sizes)
- [Demo](#demo)
- [License](#license)

---

## Quickstart

Get a working loader in under 2 minutes.

**1. Add the CSS to `<head>`**

```html
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/szsoma/loady@main/loady.css">
</head>
```

**2. Add the script before `</body>`**

```html
<body>
  <!-- Your content here -->

  <div data-loady="container">
    <div class="my-loader">Loading...</div>
  </div>

  <script src="https://cdn.jsdelivr.net/gh/szsoma/loady@main/dist/loady.min.js"></script>
</body>
```

**3. Hook up GSAP**

```html
<script>
  window.addEventListener('pageLoady:finished', function () {
    gsap.set('[data-gsap-hide]', { autoAlpha: 1 });
    gsap.from('.hero-heading', { y: 50, opacity: 0, duration: 1 });
  });
</script>
```

Done. The loader waits for assets to load, plays a fade-out, then fires `pageLoady:finished` for your GSAP code.

---

## How It Works

Loady runs entirely client-side with no build step.

1. The CSS hides `[data-gsap-hide]` elements and locks body scroll synchronously in `<head>` — no flash of unstyled content.
2. On `DOMContentLoaded`, the script locates `[data-loady="container"]`, parses its data attributes, and starts tracking assets (`img`, `iframe`, `video[src]`, `script[src]`).
3. As assets load, a progress counter moves from 0% to 85%. A `pageLoady:progress` event fires at ~30fps.
4. When all assets finish (or the failsafe timeout fires), the loader plays its exit animation.
5. On exit, `pageLoady:finished` fires on `window`. Your code listens for it and starts animations.

---

## Installation

### CDN (Recommended)

Replace `@main` with a tagged version (e.g. `@1.0.0`) for pinned releases.

**CSS** — add in `<head>`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/szsoma/loady@main/loady.css">
```

This does three things:
- Hides `[data-gsap-hide]` elements until animations are ready
- Locks `overflow: hidden` on body while the loader is active
- Positions the loader fixed full-screen with maximum z-index

**Script** — add before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/szsoma/loady@main/dist/loady.min.js"></script>
```

**Purge cache after push:**

```
https://purge.jsdelivr.net/gh/szsoma/loady@main/dist/loady.min.js
```

### ESM

```html
<script type="module">
  import 'https://cdn.jsdelivr.net/gh/szsoma/loady@main/dist/loady.esm.min.js';
</script>
```

### NPM + Bundler

```sh
npm install loady
```

```js
import 'loady/loady.css';
import 'loady';
```

---

## Configuration

All configuration is done via `data-*` attributes on the loader container. No JavaScript API required.

### Loader Container

| Attribute | Value | Description |
|-----------|-------|-------------|
| `data-loady` | `"container"` | **Required.** Identifies the loader wrapper element. |
| `data-gsap-hide` | *(any)* | Add to elements to hide them until `pageLoady:finished` fires. Auto-hidden for dynamically injected nodes via MutationObserver. |

```html
<div data-loady="container">
  <div class="spinner"></div>
</div>

<section data-gsap-hide>
  <h1>Hero Content</h1>
</section>
```

### Animation

| Attribute | Default | Values |
|-----------|---------|--------|
| `data-loady-anim` | `fade` | `fade`, `slide-up`, `slide-down` |
| `data-loady-easing` | `ease-in-out` | Any CSS easing (`linear`, `ease`, `cubic-bezier(...)`) |
| `data-loady-duration` | `0.5` | Seconds. Minimum effective value is `0.1`. Set to `0` for instant hide. |

```html
<div data-loady="container" data-loady-anim="slide-up" data-loady-duration="0.8" data-loady-easing="cubic-bezier(0.16, 1, 0.3, 1)">
```

### Timing

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-loady-failsafe` | `5000` | Max wait (ms) before force-dismissing. Prevents hangs. |
| `data-loady-min` | `0` | Minimum display time (ms). Prevents flicker on cached pages. |
| `data-loady-threshold` | `1.0` | Fraction of assets (0.0–1.0) that must load before exit begins. `0.5` = exit when half loaded. |

```html
<div data-loady="container" data-loady-failsafe="3000" data-loady-min="800" data-loady-threshold="0.8">
```
**How data-loady-min and data-loady-threshold work together**

1. Threshold (data-loady-threshold): Controls WHEN the loader starts its exit.

2. Min (data-loady-min): Controls how long the loader must stay visible.

So they work in sequence:
1. Threshold triggers removeLoader (the "decision to exit")
2. Min-time determines when animateOut actually starts (the "timing of exit")

For example, with threshold=0.5 and min=2000, if half the assets load in 500ms, the loader waits the remaining 1500ms before animating out. The counter holds at 85% during that wait, then transitions to 100% over the exit duration.

The threshold acts as the gate—it decides when exit can begin—while min-time acts as the floor, ensuring the loader stays visible for at least that long regardless of how quickly assets load.
They don't override each other — they work in sequence:
Threshold = when to start the exit decision
Min = how long the loader must stay visible

### Progress Tracking

| Attribute | Description |
|-----------|-------------|
| `data-loady-counter` | Animate a child element from 0% to 85%, then snap to 100%. |
| `data-loady-bar` | Sync a child element's `width` with the progress percentage. |

```html
<div data-loady="container">
  <div class="loader-bg">
    <div data-loady-bar class="loader-fill"></div>
  </div>
  <span data-loady-counter>0%</span>
</div>
```

### Link Handling

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-loady-ignore` | *(none)* | CSS selector for links that skip the loader on next navigation. Clicking an ignored link sets a session flag so the next page load bypasses the loader. |

```html
<div data-loady="container" data-loady-ignore=".no-loader, [data-no-load]">
```

### Outbound Transitions

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-loady-outbound` | `fade`, `slide-up`, `slide-down` | Enables outbound transitions. The value is the animation used when the loader re-appears before navigating. |

When set, Loady intercepts same-origin link clicks, animates the loader in, then navigates.

Qualifying links: same-origin, not `target="_blank"`, not hash-only, not matching `data-loady-ignore`, not the current page.

```html
<div data-loady="container" data-loady-anim="slide-up" data-loady-outbound="slide-down">
```

### Prefetch

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-loady-prefetch` | `false` | Injects `<link rel="prefetch">` after 80ms of cursor/touch dwell on a qualifying link. |

Prefetching is suppressed on `saveData` and slow connections (`2g`, `slow-2g`). Each URL is prefetched at most once per page session.

```html
<div data-loady="container" data-loady-prefetch="true" data-loady-outbound="fade">
```

### View Transitions

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-loady-view-transition` | `true`, `persistent` | Delegates between-pages transitions to the browser's View Transition API. Requires `data-loady-outbound`. |

| Value | Effect |
|-------|--------|
| `true` | Full-page crossfade — browser captures old and new page, animates between them |
| `persistent` | Loader persists across the navigation boundary via `view-transition-name` |

Falls back to CSS animation if the API is unsupported.

```html
<div data-loady="container" data-loady-outbound="slide-down" data-loady-view-transition="persistent">
```

When view transitions are enabled, Loady also injects `@view-transition { navigation: auto; }`, giving non-intercepted navigations a native crossfade in supporting browsers.

### Session Behavior

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-loady-once` | `false` | Show the loader only once per tab session. Uses `sessionStorage`; resets when the tab closes. |

### Auto-Pause

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-loady-gsap` | `true` | Auto-pause `gsap.globalTimeline` during load. |
| `data-loady-ix2` | `true` | Auto-pause Webflow IX2 interactions during load. |

Both are auto-detected and paused by default. Opt out with `="false"`.

```html
<div data-loady="container" data-loady-gsap="false" data-loady-ix2="false">
```

### Debug

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-loady-debug` | `false` | Log performance metrics to the console on loader exit. |

---

## Events

### `pageLoady:finished`

Fires on `window` when the loader has fully exited. This is your signal to start GSAP animations.

```js
window.addEventListener('pageLoady:finished', function (e) {
  // e.detail.source: 'normal' | 'noloader' | 'bfcache'
  gsap.set('[data-gsap-hide]', { autoAlpha: 1 });
});
```

**`detail.source` values:**

| Value | Meaning |
|-------|---------|
| `normal` | Loader completed its full cycle (asset loading, animation, min display time) |
| `noloader` | Bypassed via `?noloader=true` query parameter |
| `bfcache` | Page restored from back-forward cache |

### `pageLoady:progress`

Fires on `window` at ~30fps during loading. Use for custom progress renderers (Lottie, SVG, canvas, Three.js).

```js
window.addEventListener('pageLoady:progress', function (e) {
  console.log(e.detail.percent);  // 0–100 integer
  console.log(e.detail.raw);      // 0.0–1.0 float
  console.log(e.detail.phase);    // 'loading' | 'min-wait' | 'animating'
});
```

Progress is capped at 85% during loading and snaps to 100% when the exit animation begins.

**Phase values:**

| Phase | Meaning |
|-------|---------|
| `loading` | Actively waiting for assets to load |
| `min-wait` | Assets loaded, waiting for minimum display time to elapse |
| `animating` | Exit animation playing |

---

## GSAP & Webflow IX2 Integration

Loady auto-detects and pauses GSAP and Webflow IX2 animations while the loader is active, preventing animation conflicts:

- **GSAP** — pauses `gsap.globalTimeline` on init, resumes on `pageLoady:finished`
- **Webflow IX2** — calls `destroy()` on the IX2 engine on init, re-initializes with `init()` on finish

Both are auto-detected and paused by default. Opt out:

```html
<div data-loady="container" data-loady-gsap="false" data-loady-ix2="false">
```

---

## How Loaders Exit

Loady uses multiple exit triggers. The first one to fire wins — subsequent triggers are ignored (idempotent).

| Trigger | Condition | Typical Timing |
|---------|-----------|----------------|
| **Threshold** | Fraction of tracked assets loaded (configurable via `data-loady-threshold`) | Variable |
| **Window Load** | `window` load event fires | After all resources |
| **Failsafe** | Configurable timeout (`data-loady-failsafe`, default 5000ms) | Fixed |
| **Min Display** | Minimum display time elapsed (`data-loady-min`) | After threshold |

The exit sequence:
1. `removeLoader()` — logs debug info, calculates remaining min display time, schedules `animateOut()`
2. `animateOut()` — sets the exit animation via CSS transitions
3. `completeLoader()` — fires final `pageLoady:progress` (100%), resumes GSAP/IX2, cleans up DOM, fires `pageLoady:finished`

---

## Back Button Behavior

Loady listens for `pageshow` with `event.persisted` to handle bfcache restoration. On back/forward navigation, the loader is force-hidden and `pageLoady:finished` is dispatched with `source: 'bfcache'`.

---

## URL Bypass

Append `?noloader=true` to any URL to skip the loader entirely. Useful during QA and staging.

```
https://example.com/page?noloader=true
```

---

## Features

- **Anti-FOUC CSS** — synchronous `<head>` snippet prevents the flash of unstyled content
- **Event-driven handoff** — no coupling to GSAP internals; your code listens for `pageLoady:finished`
- **Exit animations** — fade, slide-up, slide-down via CSS transitions
- **Failsafe timeout** — configurable max wait so the loader can't hang indefinitely
- **Minimum display time** — prevents flicker on fast-loading pages
- **Progress counter** — 0%→85% eased counter, snaps to 100% on exit
- **Progress bar** — sync a child element's width with load progress
- **Ignore links** — exclude any selector from triggering the loader
- **Accessible** — sets `aria-busy="true"` on body during load
- **MutationObserver** — auto-hides dynamically injected `[data-gsap-hide]` elements and tracks dynamically injected `<img>` tags for threshold progress
- **GSAP & IX2 auto-pause** — detects and pauses GSAP timelines and Webflow IX2 interactions during load
- **Progress event** — `pageLoady:progress` exposes real-time loading progress for custom renderers
- **Threshold loading** — exit early when a fraction of assets have loaded
- **Outbound transitions** — animate the loader back in before navigating to the next page
- **Hover prefetch** — pre-fetches destination HTML for near-instant page loads (mouse and touch)
- **View transitions** — delegates between-pages transitions to the native View Transition API
- **bfcache handling** — restores page state on back/forward navigation
- **Duration safety** — clamps sub-0.1s durations to 0.1s; `duration=0` triggers instant hide
- **navigating guard** — prevents double-click from triggering duplicate navigations
- **try/catch guards** — catches initialization errors so a broken page doesn't crash silently
- **Zero dependencies** — pure vanilla JS, works with any framework or none
- **~3.5 KB gzipped** — CSS + JS combined

---

## Development

```sh
npm install
npm run build       # Build dist/ files
npm run dev         # Watch mode
npm test            # Run tests (86 tests)
```

### Output Formats

| File | Format | Raw | Gzipped |
|------|--------|-----|---------|
| `dist/loady.js` | IIFE (unminified) | 16.7 KB | 4.0 KB |
| `dist/loady.min.js` | IIFE (minified) | 7.8 KB | 2.9 KB |
| `dist/loady.esm.js` | ESM (unminified) | 15.8 KB | 4.0 KB |
| `dist/loady.esm.min.js` | ESM (minified) | 7.8 KB | 2.9 KB |
| `loady.css` | CSS | 1.3 KB | 0.6 KB |

---

## Demo

Open `demo/index.html` in a local server:

```sh
npx serve .
```

---

## License

MIT
