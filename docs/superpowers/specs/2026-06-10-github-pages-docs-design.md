# Loady GitHub Pages Documentation — Design Spec

## Overview

Single-page documentation site for Loady, hosted on GitHub Pages. Hand-crafted HTML/CSS, no build step, no dependencies. Served from `docs/index.html`.

## Target URL

`https://szsoma.github.io/loady/`

## File Structure

```
docs/
  index.html          # The documentation site (self-contained)
```

No build step. No extra files. The page pulls in Prism.js from CDN for syntax highlighting only.

## Page Structure (top to bottom)

### 1. Hero

- Project name: **Loady**
- Tagline: "FOUC-free page loader orchestrator for GSAP-powered websites"
- Badge: "~2KB minified, zero dependencies"
- Two CTA buttons: "Get Started" (scrolls to install) + "View on GitHub" (links to repo)

### 2. Getting Started

3-step quickstart guide:

**Step 1: Add CSS to `<head>`**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/szsoma/loady@main/loady.css">
```
Brief explanation of what the CSS does (hides elements, locks scroll, positions loader).

**Step 2: Add script before `</body>`**
```html
<script src="https://cdn.jsdelivr.net/gh/szsoma/loady@main/dist/loady.min.js"></script>
```
Note about ESM alternative and cache purging.

**Step 3: Mark up your loader + hook up GSAP**
Combined markup + event listener code block.

### 3. Data Attribute API

Full table with columns: Attribute | Default | Description

All 15+ attributes from README, formatted as a clean responsive table. Each attribute links to its section if it has deeper docs.

### 4. Events

Two events documented:

- `pageLoady:finished` — dispatched on window, your signal to start GSAP
- `pageLoady:progress` — dispatched during load with `{ percent, raw, phase }` detail

Each with a code snippet showing usage.

### 5. Examples

4 practical use cases with code blocks:

1. **Basic loader** — minimal setup with fade animation
2. **Progress counter + bar** — using `data-loady-counter` and `data-loady-bar`
3. **Outbound transitions** — `data-loady-outbound` for page-to-page navigation
4. **Hover prefetch** — `data-loady-prefetch` for instant page loads

### 6. Interactive Demo

`<iframe>` embedding the existing `demo/index.html`. The iframe gets a border, rounded corners, and a "Open in new tab" link below it.

### 7. Changelog

Version history derived from git commits, grouped by type (feat/fix/docs):

- v1.0.0 — Initial release with core features
- Outbound transitions, hover prefetch, View Transition API
- GSAP & Webflow IX2 auto-pause
- Progress event and threshold loading
- Counter/bar animation smoothing fixes
- Accessibility, MutationObserver, session run-once
- URL bypass (`?noloader=true`)

### 8. Footer

- "Made with care" or similar
- GitHub link
- MIT license note

## Design Tokens

| Token | Value |
|---|---|
| Font | `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif` |
| Code font | `'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace` |
| Background | `#ffffff` (main), `#f8f9fa` (alternate sections) |
| Text | `#1a1a2e` (headings), `#4a5568` (body) |
| Accent | `linear-gradient(135deg, #a78bfa, #ec4899)` (purple → pink) |
| Code bg | `#f1f5f9` with `#e2e8f0` border |
| Border | `#e2e8f0` |

## Layout

- Max width: `900px` centered
- Sticky top nav bar with section links (smooth scroll)
- Mobile responsive: single column, nav collapses to hamburger or inline links
- Sections separated by subtle dividers or alternating backgrounds

## Syntax Highlighting

Prism.js loaded from CDN (light theme). Supports HTML and JavaScript.

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
```

## GitHub Pages Setup

1. Create `docs/index.html`
2. Push to `main`
3. In repo Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder: `/docs`
4. Site goes live at `https://szsoma.github.io/loady/`

## Constraints

- Single file (`docs/index.html`) — no build, no extra assets
- All CDN links use specific versions (no `@latest`)
- Prism.js is the only external dependency (CDN)
- No JavaScript framework needed — pure HTML/CSS/JS
- Must work without JS (content readable, just no syntax highlighting or smooth scroll)
