This is a solid set of optimization targets. Keeping a FOUC-free orchestrator under ~3.5 KB gzipped while maintaining Webflow IX2 and GSAP compatibility requires surgical precision. Since the primary goal of this script is to hand off a clean DOM to your GSAP animations, keeping the main thread completely unblocked during the pre-load phase is critical.

Here is the architectural implementation plan for each of your five optimization targets.

---

### **1. Reduce Repetitive DOM Queries**

**The bottleneck:** The script currently queries `[data-gsap-hide]`, `img`, and child nodes multiple times throughout its lifecycle. Searching the DOM tree repeatedly eats into your JS budget, especially on large, node-heavy Webflow builds.

**Implementation Plan:**

* **Establish a Central Cache:** Create a single DOM state object at script initialization to store references.
* **Targeted Lookups:** Cache `[data-loady="container"]`, `[data-loady-counter]`, and `[data-loady-bar]` immediately.
* **Live Collections for Dynamic Nodes:** Instead of running `querySelectorAll` inside the MutationObserver, use `getElementsByClassName` or `getElementsByTagName` where appropriate, as they return live HTMLCollections that update automatically without re-evaluating the DOM.
* **Cache Execution:**
```javascript
const domCache = {
  container: document.querySelector('[data-loady="container"]'),
  counter: null, // assigned after container is found
  bar: null,     // assigned after container is found
  hiddenElements: document.querySelectorAll('[data-gsap-hide]') 
};
if (domCache.container) {
  domCache.counter = domCache.container.querySelector('[data-loady-counter]');
  domCache.bar = domCache.container.querySelector('[data-loady-bar]');
}

```



### **2. Throttle Progress Updates**

**The bottleneck:** The current 30 FPS tick function forces layout/paint calculations by updating `textContent` and `style.width` via a chained `requestAnimationFrame` and `setTimeout` combination. This approach creates micro-stutters on low-end mobile devices.

**Implementation Plan:**

* **Delta-Time Throttling:** Drop the `setTimeout` entirely. Rely purely on `requestAnimationFrame`, but track the timestamp delta to ensure DOM writes only happen exactly when needed (e.g., every ~33ms).
* **Batch DOM Writes:** Calculate the interpolated progress value in memory, and only touch the DOM if the integer percentage has actually changed since the last frame.
* **Execution:**
```javascript
let lastUpdate = 0;
let lastPercent = -1;
const throttleMs = 1000 / 30; // 30 FPS

function tick(timestamp) {
  if (timestamp - lastUpdate >= throttleMs) {
     const currentPercent = Math.round(calculateProgress()); 
     // Only write to DOM if the visible number changed
     if (currentPercent !== lastPercent) {
        if (domCache.counter) domCache.counter.textContent = currentPercent + "%";
        if (domCache.bar) domCache.bar.style.width = currentPercent + "%";
        lastPercent = currentPercent;
     }
     lastUpdate = timestamp;
  }
  if (!isFinished) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

```



### **3. Use CSS Custom Properties for All Animations**

**The bottleneck:** Currently, the script writes inline styles like `transition`, `transform`, and `opacity` directly to the container via JavaScript. Moving these to CSS variables shifts the animation interpolation strictly to the browser's compositor thread.

**Implementation Plan:**

* **Extend the CSS File:** Update `loady.css` to handle state classes (e.g., `.is-outbound-up`, `.is-exiting`) using CSS custom properties.
* **Data-Attribute Toggling:** Instead of calculating `translateY(100%)` in JS, simply switch a `data-loady-state` attribute on the container.
* **Execution:**
* **In CSS:**
```css
[data-loady="container"] {
  transition: opacity var(--loady-duration) var(--loady-easing), 
              transform var(--loady-duration) var(--loady-easing);
}
[data-loady="container"][data-loady-state="slide-up"] {
  transform: translateY(-100%);
}

```


* **In JS:** Remove the `ee()` transformation function. Set `domCache.container.setAttribute('data-loady-state', animType)` to trigger the hardware-accelerated transitions.



### **4. Lazy Initialize Debug Logger**

**The bottleneck:** The debug check (`isDebug`) is evaluated in the hot path, specifically inside the `mouseover` prefetch function.

**Implementation Plan:**

* **Evaluate Once at Init:** Determine the debug status exactly once when the script loads.
* **No-Op Function Assignment:** Create a global or scoped logging utility that either points to `console.log` or a blank function (`() => {}`).
* **Execution:**
```javascript
const isDebug = f.getAttribute("data-loady-debug") === "true";
const logger = isDebug ? console : {
  log: () => {},
  groupCollapsed: () => {},
  table: () => {},
  groupEnd: () => {}
};

// In your hot path:
logger.log("Prefetched:", url); // No branching logic needed during the event

```



### **5. Combine Event Listeners**

**The bottleneck:** The `mouseover` and `touchstart` event handlers share almost identical logic for checking the connection type (saving data / 2G) and pushing URLs to the WeakMap.

**Implementation Plan:**

* **Abstract Intent Logic:** Create a single `handleIntent(event)` function that processes the node, validates the anchor tag, checks the connection API, and handles the prefetch timeout.
* **Event Delegation:** Attach both listeners to the `document` (which the script already does), but route them through the unified handler.
* **Execution:**
```javascript
function handleLinkIntent(e) {
  const target = e.target.closest("a");
  if (!target || !isValidLink(target)) return;

  const conn = navigator.connection;
  if (conn && (conn.saveData || conn.effectiveType.includes('2g'))) return;

  const timer = setTimeout(() => {
    prefetchUrl(target.href);
    intentMap.delete(target);
  }, 80);

  intentMap.set(target, timer);

  // Clear on exit depending on event type
  const clearEvent = e.type === 'touchstart' ? 'touchend' : 'mouseleave';
  target.addEventListener(clearEvent, () => {
    clearTimeout(intentMap.get(target));
    intentMap.delete(target);
  }, { once: true });
}

document.addEventListener("mouseover", handleLinkIntent);
document.addEventListener("touchstart", handleLinkIntent, { passive: true });

```
