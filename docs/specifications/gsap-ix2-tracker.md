### GSAP / Webflow IX2 Detection Idea

Here's how I'd break it down:

**GSAP detection**
GSAP registers itself on `window.gsap`. If it exists, you can check for registered timelines or `ScrollTrigger` instances. The real question is: what do you *do* with them? A few options:

- **Pause all GSAP timelines on init** (`gsap.globalTimeline.pause()`), then resume on `pageLoady:finished` — simple, nuclear, effective
- **Opt-in via attribute** — `data-loady-gsap="pause"` lets authors choose; avoids breaking edge cases where some animations *should* run during load (e.g. the loader itself)

**Webflow IX2 detection**
Webflow IX2 exposes itself at `window.Webflow` and the interactions engine at `window.Webflow.require('ix2')`. This is fully pauseable:

```js
const ix2 = window.Webflow?.require('ix2');
ix2?.destroy(); // kill it
// later:
ix2?.init();    // restart after loady finishes
```

This is actually a huge pain point for Webflow devs — IX2 page load triggers fire before custom loaders finish, causing animation conflicts. This feature alone would make Loady very attractive to that audience.

**Suggested approach:** auto-detect both, pause by default, expose a `data-loady-gsap` / `data-loady-ix2` attribute to opt out if needed.

---
