Building out Developer Experience (DX) and robust QA tools is exactly how you elevate a script from a simple utility to a premium, agency-grade asset. It saves hours of frustration during the QA phase and handles the edge cases that Webflow's dynamic nature often presents.

Here is the technical specification and implementation guide for these new features.

---

### 1. Developer Experience (DX) & QA Tools

These features are designed to give developers and testers control over the script's behavior without needing to alter the codebase or Webflow Designer settings temporarily.

#### Feature 1.1: URL Parameter Bypass (`?noloader=true`)

When Liam, Dan Foster, or any client is reviewing staging links, sitting through a loader repeatedly disrupts the testing flow. This feature completely aborts the loader logic if a specific query string is present.

**Implementation Strategy:**
Parse the URL string before doing anything else in the script. If the parameter exists, instantly remove the loader DOM element and reveal the GSAP elements.

```javascript
// 1. Check for bypass parameter
const urlParams = new URLSearchParams(window.location.search);
const bypassLoader = urlParams.get('noloader') === 'true';

if (bypassLoader) {
  // Instantly remove loader and show hidden elements
  if (loader) loader.style.display = 'none';
  document.body.removeAttribute('data-loader-status');
  document.querySelectorAll('[data-gsap-hide]').forEach(el => {
    el.style.visibility = 'inherit';
    el.style.opacity = '1';
  });
  // Hand off to GSAP immediately
  window.dispatchEvent(new CustomEvent('pageLoader:finished'));
  return; // Stop the rest of the script from running
}

```

#### Feature 1.2: Session Storage "Run Once" (`data-loader-once="true"`)

Users navigating through the site shouldn't see the initial heavy loading sequence on every internal page click. Relying on `sessionStorage` ensures the loader only plays once per browser tab session.

**Implementation Strategy:**
Check for a specific key in `sessionStorage`. If it exists, execute the bypass logic. If it doesn't, play the loader and then set the key.

```javascript
const runOnce = loader.getAttribute('data-loader-once') === 'true';

if (runOnce) {
  const hasSeenLoader = sessionStorage.getItem('loaderSeen');
  
  if (hasSeenLoader) {
    // Execute the same bypass logic as above
    loader.style.display = 'none';
    document.body.removeAttribute('data-loader-status');
    // Ensure GSAP gets the signal immediately
    window.dispatchEvent(new CustomEvent('pageLoader:finished'));
    return;
  } else {
    // Set the flag for the next page load
    sessionStorage.setItem('loaderSeen', 'true');
  }
}

```

#### Feature 1.3: Debug Mode Console Logger (`data-loader-debug="true"`)

Console logs are great, but a messy console is useless. Debug mode should output a highly organized, styled table to the console so you can see exactly how the script is performing, how long the page took to load, and if the failsafe was triggered.

**Implementation Strategy:**
Use `console.groupCollapsed()` and `console.table()` to output performance metrics cleanly.

```javascript
const isDebug = loader.getAttribute('data-loader-debug') === 'true';
const startTime = performance.now();

const logDebugInfo = (triggerSource) => {
  if (!isDebug) return;
  const endTime = performance.now();
  const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
  
  console.groupCollapsed('%c🛠️ Loader Debug Info', 'background: #222; color: #bada55; padding: 4px; border-radius: 4px;');
  console.table({
    "Trigger Source": triggerSource, // 'Window Load' or 'Failsafe'
    "Time Taken (s)": timeTaken,
    "Animation Type": animType,
    "Run Once Active": runOnce,
    "Bypassed": bypassLoader
  });
  console.groupEnd();
};

// Call logDebugInfo('Window Load') or logDebugInfo('Failsafe') inside your removeLoader function.

```

---

### 2. The MutationObserver for Webflow CMS

**The Problem:** Webflow's native pagination, Finsweet's CMS Load (load more/infinite scroll), and third-party integrations inject new DOM nodes *after* your initial CSS has parsed and your script has run. If these new CMS items contain elements with `data-gsap-hide`, they might flash on the screen unstyled before GSAP can target them.

**The Solution:** A `MutationObserver` watches the DOM in real-time. The microsecond a new node is injected, it checks if the node (or its children) has the `data-gsap-hide` attribute and aggressively applies the hidden state before the browser paints it to the screen.

**Implementation Strategy:**
Set up the observer to watch the `body` (or specific CMS list wrappers) for added nodes.

```javascript
// 1. Define the observer callback
const hideInjectedElements = (mutationsList) => {
  for (const mutation of mutationsList) {
    // We only care about added nodes
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      
      mutation.addedNodes.forEach((node) => {
        // Ensure it's an element node (ignores text nodes)
        if (node.nodeType === 1) {
          
          // Check if the added node itself needs hiding
          if (node.hasAttribute('data-gsap-hide')) {
            node.style.visibility = 'hidden';
            node.style.opacity = '0';
          }
          
          // Check if any children inside the added node need hiding
          const hiddenChildren = node.querySelectorAll('[data-gsap-hide]');
          hiddenChildren.forEach(child => {
            child.style.visibility = 'hidden';
            child.style.opacity = '0';
          });
          
        }
      });
    }
  }
};

// 2. Initialize the Observer
const observer = new MutationObserver(hideInjectedElements);

// 3. Start observing the document body for injected elements
observer.observe(document.body, {
  childList: true, // Watch for added/removed nodes
  subtree: true    // Watch all descendants, not just direct children
});

// Note: You can leave this running, or call observer.disconnect() 
// when the pageLoader:finished event fires, depending on whether 
// you expect late CMS loads (like Finsweet 'Load More') on the page.

```
