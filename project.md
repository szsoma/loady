This is a classic challenge, especially when combining Webflow, GSAP, and custom loaders. The "0.1s glitch" you are experiencing is known as **FOUC (Flash of Unstyled Content)**.

Because browsers render HTML and CSS before executing JavaScript, if your GSAP script is responsible for setting the initial opacity or position of your elements, those elements will be visible for a split second before the JS kicks in and hides them.

To build a robust, agency-grade 3rd-party CDN script that solves this, you need a combination of a synchronous CSS snippet in the `<head>` and your external JS logic. Here is a complete specification for your loader script.

---

### 1. The Anti-Glitch Solution (Required `<head>` Setup)

To prevent the FOUC, the user **must** place a tiny snippet of CSS in the `<head>` of their project. This cannot be done purely via a deferred CDN script at the bottom of the body, as that is inherently too late.

Instruct the user to add this CSS and apply a `data-gsap-hide` attribute to any elements they plan to animate in later:

```html
<style>
  /* 1. Instantly hide elements meant for GSAP animations */
  [data-gsap-hide] { 
    visibility: hidden; 
    opacity: 0; 
  }
  
  /* 2. Lock body scroll while loading */
  body[data-loader-status="loading"] { 
    overflow: hidden; 
  }

  /* 3. Ensure the loader is always on top and visible initially */
  [data-loader="container"] { 
    position: fixed; 
    inset: 0; 
    z-index: 99999; 
    display: flex; 
  }
</style>

```

### 2. The Data-Attribute API

Your script will look for specific data attributes to configure the loader dynamically. This makes it highly reusable across different projects.

* **`data-loader="container"`**: Identifies the main wrapper of the page loader.
* **`data-loader-anim="fade | slide-up | slide-down"`**: Defines the exit animation. (Default: `fade`)
* **`data-loader-duration="0.5"`**: How long the exit animation takes in seconds. (Default: `0.5`)
* **`data-loader-failsafe="5000"`**: The maximum time (in milliseconds) to wait before forcing the loader to close. (Default: `5000`)

### 3. Core JavaScript Logic (The CDN Script)

Your JS script will act as the orchestrator. It should handle the loading state, the failsafe, the exit animations, and hand off control to the user's GSAP animations.

Here is the architectural flow your script should follow:

```javascript
document.addEventListener("DOMContentLoaded", () => {
  const loader = document.querySelector('[data-loader="container"]');
  if (!loader) return;

  // 1. Read Configurations
  const animType = loader.getAttribute('data-loader-anim') || 'fade';
  const duration = parseFloat(loader.getAttribute('data-loader-duration')) || 0.5;
  const failsafeTime = parseInt(loader.getAttribute('data-loader-failsafe')) || 5000;
  
  // Set initial state
  document.body.setAttribute('data-loader-status', 'loading');
  let isLoaded = false;

  // 2. The Exit Function
  const removeLoader = () => {
    if (isLoaded) return; // Prevent double execution
    isLoaded = true;

    // Apply the chosen exit animation (using CSS transitions for performance)
    loader.style.transition = `all ${duration}s ease-in-out`;
    
    if (animType === 'fade') {
      loader.style.opacity = '0';
    } else if (animType === 'slide-up') {
      loader.style.transform = 'translateY(-100%)';
    } else if (animType === 'slide-down') {
      loader.style.transform = 'translateY(100%)';
    }

    // 3. Cleanup and Handoff
    setTimeout(() => {
      loader.style.display = 'none';
      document.body.removeAttribute('data-loader-status'); // Restores scrolling
      
      // DISPATCH CUSTOM EVENT: This is how we tell GSAP to start
      window.dispatchEvent(new CustomEvent('pageLoader:finished'));
    }, duration * 1000);
  };

  // 4. Triggers (Window Load vs Failsafe)
  window.addEventListener('load', removeLoader); // Triggers when all assets (images, etc.) finish loading
  setTimeout(removeLoader, failsafeTime); // Triggers if 5 seconds pass to prevent infinite loading
});

```

### 4. Pausing and Triggering GSAP (The Handoff)

Instead of trying to pause `gsap.globalTimeline` from your CDN script (which can cause issues if the user's GSAP code hasn't initialized yet), the cleanest architectural pattern is **Event-Driven**.

Your script dispatches a custom event (`pageLoader:finished`) when the loader is completely gone. The user simply wraps their GSAP initialization code inside an event listener for that specific event.

**What the user writes in their project:**

```javascript
// Wait for the CDN loader script to announce it has finished
window.addEventListener('pageLoader:finished', () => {
  
  // 1. Make the hidden elements visible again before animating
  gsap.set('[data-gsap-hide]', { autoAlpha: 1 }); 

  // 2. Run initial page animations
  gsap.from('.hero-heading', {
    y: 50,
    opacity: 0,
    duration: 1,
    stagger: 0.2
  });
  
});

```

*Note: `autoAlpha: 1` in GSAP handles both `visibility: visible` and `opacity: 1` simultaneously, perfectly reversing the CSS we added in the `<head>`.*

---

### 5. Additional Feature Ideas to Consider

To make this script truly robust for production use, consider adding these features:

* **Minimum Display Time (`data-loader-min="1000"`):** Sometimes, cached pages load *too* fast. If a page loads in 50ms, the loader flashes on screen for a fraction of a second, which looks like a glitch. Adding a minimum display time ensures the loader stays on screen for at least 1-1.5 seconds so the user can actually process the loading animation.
* **Excluded Links (`data-loader-ignore`):** If a user clicks an anchor link (`#section`) or a `mailto:` link, the browser doesn't reload the page, but sometimes custom scripts mistakenly trigger the loader. Ensure your script only fires on actual page navigations.
* **Accessibility (A11y) Focus Trap:** While the loader is active, keyboard users might accidentally tab through the hidden page behind it. The script should set `aria-busy="true"` on the body and ideally trap focus within the loader until it is dismissed.
* **Visual Progress Counter:** You could add a `data-loader-counter="true"` attribute that targets a specific text span inside the loader. You can write a lightweight interval in your script that fakes counting from 0% to 85% quickly, and then forcefully snaps to 100% the moment the `window.onload` event fires.
