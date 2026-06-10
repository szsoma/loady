# GitHub Pages Documentation Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single-page documentation site at `docs/index.html` for Loady, hosted on GitHub Pages.

**Architecture:** One self-contained HTML file with inline CSS. No build step, no framework. Prism.js from CDN for syntax highlighting. Smooth-scroll sticky nav, responsive layout, light theme matching the existing demo's purple-pink accent.

**Tech Stack:** HTML5, CSS3, Prism.js (CDN)

---

## File Structure

| File | Purpose |
|---|---|
| `docs/index.html` | The entire documentation site (create) |

No existing files are modified.

---

## Task 1: Create docs/index.html — Full Page

**Files:**
- Create: `docs/index.html`

This is a single file containing all HTML, inline CSS, and content. The page has these sections in order:

1. `<head>` — meta tags, Prism.js CSS, inline styles
2. Hero — name, tagline, badge, CTA buttons
3. Getting Started — 3-step install guide with code blocks
4. Data Attribute API — full attribute table
5. Events — two events with code snippets
6. Examples — 4 practical use cases
7. Interactive Demo — iframe embedding `demo/index.html`
8. Changelog — version history
9. Footer — GitHub link, license
10. Scripts — Prism.js JS, smooth scroll

- [ ] **Step 1: Create the HTML skeleton with `<head>` and meta tags**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loady — Documentation</title>
  <meta name="description" content="FOUC-free page loader orchestrator for GSAP-powered websites">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
  <style>
    /* Reset & Base */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      color: #1a1a2e;
      background: #ffffff;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    /* ... full inline CSS goes here ... */
  </style>
</head>
<body>
  <!-- Content sections -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add the sticky navigation bar**

```html
<nav class="navbar">
  <div class="nav-inner">
    <a href="#" class="nav-logo">Loady</a>
    <div class="nav-links">
      <a href="#getting-started">Getting Started</a>
      <a href="#api">API</a>
      <a href="#events">Events</a>
      <a href="#examples">Examples</a>
      <a href="#demo">Demo</a>
      <a href="#changelog">Changelog</a>
      <a href="https://github.com/szsoma/loady" target="_blank" rel="noopener">GitHub</a>
    </div>
  </div>
</nav>
```

- [ ] **Step 3: Add the Hero section**

```html
<section class="hero">
  <span class="badge">~2KB minified, zero dependencies</span>
  <h1>Loady</h1>
  <p class="hero-sub">FOUC-free page loader orchestrator for GSAP-powered websites. Drop it in, configure with data attributes, ship it.</p>
  <div class="hero-cta">
    <a href="#getting-started" class="btn btn-primary">Get Started</a>
    <a href="https://github.com/szsoma/loady" class="btn btn-outline" target="_blank" rel="noopener">View on GitHub</a>
  </div>
</section>
```

- [ ] **Step 4: Add the Getting Started section with 3-step install**

Include the CSS link, script tag, loader markup, and GSAP event listener code blocks. Each step has a heading, explanation, and a `<pre><code class="language-html">` block.

- [ ] **Step 5: Add the Data Attribute API table**

Full responsive table with all 15+ attributes. Columns: Attribute, Default, Description. Use `<table>` with proper `<thead>`/`<tbody>`.

- [ ] **Step 6: Add the Events section**

Document `pageLoady:finished` and `pageLoady:progress` with code snippets showing usage.

- [ ] **Step 7: Add the Examples section**

4 practical code examples:
1. Basic loader with fade
2. Progress counter + bar
3. Outbound transitions
4. Hover prefetch

Each in a `<pre><code class="language-html">` block with a brief description.

- [ ] **Step 8: Add the Interactive Demo section**

```html
<section id="demo" class="section">
  <h2>Interactive Demo</h2>
  <p>See Loady in action. The loader plays on page load, then reveals the demo content.</p>
  <div class="demo-embed">
    <iframe src="../demo/index.html" title="Loady Demo" loading="lazy"></iframe>
    <a href="../demo/index.html" target="_blank" rel="noopener" class="demo-link">Open demo in new tab &rarr;</a>
  </div>
</section>
```

- [ ] **Step 9: Add the Changelog section**

Version history grouped by type, derived from git commits:
- v1.0.0 — Initial release
- Features added in order: outbound transitions, hover prefetch, View Transition API, GSAP/IX2 auto-pause, progress event, threshold loading, session run-once, URL bypass, debug mode, MutationObserver, easing customization, progress bar
- Fixes: counter smoothing, ignoreList behavior

- [ ] **Step 10: Add the Footer**

```html
<footer class="footer">
  <p>Loady is MIT licensed. Built for the GSAP community.</p>
  <a href="https://github.com/szsoma/loady" target="_blank" rel="noopener">GitHub</a>
</footer>
```

- [ ] **Step 11: Write all inline CSS**

Complete CSS including:
- Navbar (sticky, backdrop-blur, border-bottom)
- Hero (centered, gradient heading)
- Sections (alternating backgrounds, max-width 900px)
- Code blocks (light gray bg, rounded corners, overflow scroll)
- Table (responsive, horizontal scroll on mobile)
- Demo iframe (16:9 aspect ratio, border, rounded corners)
- Buttons (primary gradient, outline variant)
- Mobile responsive (single column, nav wraps)

- [ ] **Step 12: Open in browser to verify**

Run: `open docs/index.html` or `npx serve docs`

Verify:
- All sections render correctly
- Code blocks have syntax highlighting (Prism)
- Sticky nav works
- Smooth scroll works
- Demo iframe loads
- Mobile responsive at 375px width

- [ ] **Step 13: Commit**

```bash
git add docs/index.html
git commit -m "docs: add GitHub Pages documentation site"
```

---

## Verification

After completing all steps:
1. Open `docs/index.html` in a browser
2. Check all sections are visible and content is correct
3. Verify syntax highlighting works on code blocks
4. Test smooth scroll navigation from the sticky nav
5. Confirm the demo iframe loads `demo/index.html`
6. Test responsive layout at mobile widths
7. Run: `git diff --stat` to confirm only `docs/index.html` was created
