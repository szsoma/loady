No — but a few specific changes need careful handling. Let me be direct about each one.

---

## Changes That Are Fully Safe

These are additive or internal — existing integrations don't know or care.

**New internal guards (try/catch, clamps, idempotent exit)** — purely internal refactors. Your `pageLoady:finished` listener fires exactly the same way. Nothing changes from the outside.

**`exitLoady()` consolidation** — replaces whatever ad-hoc exit logic exists now. Same observable behaviour, better guaranteed.

**`navigating` flag** — only affects double-click edge cases. Normal use is unaffected.

**`{ once: true }` on transitionend** — fixes a potential double-fire bug. If your app wasn't hitting that bug, you won't notice the change.

**Counter monotonic wrapper** — only prevents backward jumps. If your counter was already moving forward cleanly, identical output.

**Logging consolidation** — `warn`/`error`/`log` wrappers. No behaviour change, just cleaner console output.

**IX2 auto-pause when view transitions active** — only runs if `data-loady-view-transition` is set, which nobody is using yet since it's a new feature.

---

## Changes That Need Attention

### 1. The Inline `<style>` + Rescue Script — **Action Required**

This is the only change that requires you to touch existing installations.

**Current state:** your README tells users to add `<link rel="stylesheet" href="loady.css">` in `<head>`.

**New state:** users must also paste an inline `<style>` block and a rescue `<script>` block.

**Risk if ignored:** existing installations keep working exactly as before. The rescue script is purely additive protection — its absence doesn't break anything that currently works.

**Risk if added incorrectly:** if someone pastes the rescue script *after* the Loady script rather than before it, the rescue might not register before Loady's init runs. Order matters.

**Recommendation:** make this a clearly versioned README change. Don't silently update the CDN. Users on `@main` will get it automatically — warn them in a changelog.

---

### 2. Duration Clamped to 0.1 Minimum — **Possible Behaviour Change**

If any existing user has `data-loady-duration="0"` intentionally (wanting an instant hide), the clamp changes their experience — they now get a 100ms transition instead of instant.

It's a minor visual difference but it's a behaviour change. Two options:

- Clamp to `0` being valid but handled as a special case (skip transition entirely, just hide)
- Document the clamp and accept the minor change

The special-case approach is cleaner:

```js
if (duration === 0) {
  loaderEl.style.display = 'none';
  resolve();
  return;
}
```

---

### 3. `data-loady-once` Moving to `sessionStorage` — **Behaviour Change for Existing Users**

**Current behaviour:** unspecified (whatever it is now).

**New behaviour:** `sessionStorage`-backed, meaning a hard reload no longer resets it.

If any users relied on the loader showing on every hard reload (e.g. for testing), this silently breaks their workflow. The `?noloader=true` bypass covers the testing case — but they'd need to know that.

**Recommendation:** document this explicitly in the changelog. The `?noloader=true` bypass is the escape hatch.

---

### 4. Asset Tracking MutationObserver Expansion — **Low Risk, Worth Testing**

Currently the MutationObserver watches for `[data-gsap-hide]` injections. The new spec extends it to also watch for dynamically injected `<img>` tags for threshold tracking.

On a page with a lot of dynamic content (CMS, infinite scroll, Webflow interactions injecting images), this observer fires more often. It disconnects once the threshold is crossed, so it's not a permanent overhead — but on threshold `1.0` pages with heavy dynamic content it stays active longer.

**Test on your heaviest CMS pages** before shipping.

---

### 5. `pageLoady:finished` Now Has a `detail` Object — **Check Downstream Code**

Previously dispatched as:
```js
window.dispatchEvent(new Event('pageLoady:finished'));
```

Now dispatched as:
```js
window.dispatchEvent(new CustomEvent('pageLoady:finished', {
  detail: { source: 'normal' }
}));
```

**Any existing listener that does this is fine:**
```js
window.addEventListener('pageLoady:finished', function () {
  gsap.from('.hero', { ... });
});
```

**Any existing listener that does this breaks:**
```js
// Nobody should be doing this but worth checking
if (event instanceof Event && !(event instanceof CustomEvent)) { ... }
```

Realistically nobody is checking the event type. This is safe in practice — just worth being aware of.

---

## Migration Risk Summary

| Change | Risk | Action |
|---|---|---|
| Internal guards, try/catch | None | Ship freely |
| `exitLoady()` consolidation | None | Ship freely |
| Inline `<style>` + rescue script | None if skipped, additive if added | Document clearly, don't force |
| Duration clamp to 0.1 | Low — only affects `duration="0"` users | Handle 0 as special case |
| `data-loady-once` sessionStorage | Medium — behaviour change on hard reload | Document in changelog |
| MutationObserver expansion | Low — performance on heavy CMS pages | Test before shipping |
| `pageLoady:finished` → CustomEvent | None in practice | Ship freely |
| Prefetch touch guard | None — fixes a bug | Ship freely |
| IX2 auto-pause | None — only on new `data-loady-view-transition` attr | Ship freely |

---

## Recommended Ship Order

Don't ship everything at once. A sensible sequence:

**v1.1 — Internal hardening only** (zero user-facing changes)
Exit contract, failsafe hardening, selector safety, counter monotonic wrapper, logging, `navigating` flag, `{ once: true }` fixes. Users on `@main` get this silently. Nothing breaks.

**v1.2 — New attributes**
`data-loady-threshold`, `pageLoady:progress` event, `data-loady-once` sessionStorage fix. Additive. Changelog note about `once` behaviour change.

**v1.3 — Outbound + prefetch**
New features, new attributes. Opt-in only — nothing changes for existing installs.

**v1.4 — View transitions**
Opt-in only. New attribute, no effect on existing setups.

**v2.0 — Breaking changes only if needed**
If the inline `<style>` + rescue script becomes a hard requirement (it shouldn't need to be), that's a major version bump with a migration guide.
