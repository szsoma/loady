(function () {

  var IGNORE_KEY = 'loady:ignore';
  var SEEN_KEY = 'loady:seen';

  var gsapTL = null;

  function pauseGSAP() {
    if (window.gsap && window.gsap.globalTimeline) {
      gsapTL = window.gsap.globalTimeline;
      gsapTL.pause();
    }
  }

  function resumeGSAP() {
    if (gsapTL) {
      gsapTL.resume();
      gsapTL = null;
    }
  }

  var ix2Engine = null;

  function pauseIX2() {
    if (window.Webflow && typeof window.Webflow.require === 'function') {
      ix2Engine = window.Webflow.require('ix2');
      if (ix2Engine) ix2Engine.destroy();
    }
  }

  function resumeIX2() {
    if (ix2Engine) {
      ix2Engine.init();
      ix2Engine = null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var loader = document.querySelector('[data-loady="container"]');
    if (!loader) return;

    var skipGSAP = loader.getAttribute('data-loady-gsap') === 'false';
    if (!skipGSAP) pauseGSAP();

    var skipIX2 = loader.getAttribute('data-loady-ix2') === 'false';
    if (!skipIX2) pauseIX2();

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('noloader') === 'true') {
      sessionStorage.removeItem(SEEN_KEY);
      sessionStorage.removeItem(IGNORE_KEY);
      finishImmediately();
      return;
    }

    var runOnce = loader.getAttribute('data-loady-once') === 'true';
    if (runOnce && sessionStorage.getItem(SEEN_KEY) === 'true') {
      finishImmediately();
      return;
    }
    if (runOnce) {
      sessionStorage.setItem(SEEN_KEY, 'true');
    }

    if (sessionStorage.getItem(IGNORE_KEY) === '1') {
      sessionStorage.removeItem(IGNORE_KEY);
      finishImmediately();
      return;
    }

    var animType = loader.getAttribute('data-loady-anim') || 'fade';
    var durationVal = parseFloat(loader.getAttribute('data-loady-duration'));
    var duration = isNaN(durationVal) ? 0.5 : durationVal;
    var failsafeVal = parseInt(loader.getAttribute('data-loady-failsafe'), 10);
    var failsafeTime = isNaN(failsafeVal) ? 5000 : failsafeVal;
    var minVal = parseInt(loader.getAttribute('data-loady-min'), 10);
    var minTime = isNaN(minVal) ? 0 : minVal;
    var isDebug = loader.getAttribute('data-loady-debug') === 'true';
    var easing = loader.getAttribute('data-loady-easing') || 'ease-in-out';

    var startTime = Date.now();
    var perfStart = performance.now();
    var isLoaded = false;
    var counterDone = false;
    var counterEl = loader.querySelector('[data-loady-counter]');
    var barEl = loader.querySelector('[data-loady-bar]');

    document.body.setAttribute('data-loady-status', 'loading');
    document.body.setAttribute('aria-busy', 'true');

    startCounter();

    var observer = new MutationObserver(function (mutationsList) {
      for (var i = 0; i < mutationsList.length; i++) {
        var mutation = mutationsList[i];
        if (mutation.addedNodes.length > 0) {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType === 1) {
              if (node.hasAttribute('data-gsap-hide')) {
                node.style.visibility = 'hidden';
                node.style.opacity = '0';
              }
              var hiddenChildren = node.querySelectorAll('[data-gsap-hide]');
              for (var k = 0; k < hiddenChildren.length; k++) {
                hiddenChildren[k].style.visibility = 'hidden';
                hiddenChildren[k].style.opacity = '0';
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    function logDebug(triggerSource) {
      if (!isDebug) return;
      var timeTaken = ((performance.now() - perfStart) / 1000).toFixed(2);
      console.groupCollapsed('%c Loady Debug', 'background: #222; color: #bada55; padding: 4px; border-radius: 4px;');
      console.table({
        'Trigger Source': triggerSource,
        'Time Taken (s)': timeTaken,
        'Animation Type': animType,
        'Easing': easing,
        'Duration (s)': duration,
        'Failsafe (ms)': failsafeTime,
        'Min Display (ms)': minTime,
        'Run Once': runOnce,
        'GSAP Paused': !skipGSAP && !!gsapTL,
        'IX2 Paused': !skipIX2 && !!ix2Engine,
      });
      console.groupEnd();
    }

    function removeLoader(triggerSource) {
      if (isLoaded) return;
      isLoaded = true;
      logDebug(triggerSource);

      var elapsed = Date.now() - startTime;
      var remaining = Math.max(0, minTime - elapsed);

      setTimeout(animateOut, remaining);
    }

    function animateOut() {
      snapCounterTo100();

      loader.style.transition = 'all ' + duration + 's ' + easing;

      switch (animType) {
        case 'slide-up':
          loader.style.transform = 'translateY(-100%)';
          break;
        case 'slide-down':
          loader.style.transform = 'translateY(100%)';
          break;
        case 'fade':
        default:
          loader.style.opacity = '0';
      }

      setTimeout(finish, duration * 1000);
    }

    function cleanupLoader() {
      loader.style.display = 'none';
      document.body.removeAttribute('data-loady-status');
      document.body.removeAttribute('aria-busy');
      window.dispatchEvent(new CustomEvent('pageLoady:finished'));
    }

    function finish() {
      observer.disconnect();
      resumeGSAP();
      resumeIX2();
      cleanupLoader();
    }

    function finishImmediately() {
      resumeGSAP();
      resumeIX2();
      cleanupLoader();
    }

    function renderComplete() {
      counterEl.textContent = '100%';
      if (barEl) barEl.style.width = '100%';
    }

    function startCounter() {
      if (!counterEl) return;

      var fps = 30;
      var interval = 1000 / fps;
      var start = Date.now();
      var target = 85;

      function easeOutQuad(t) {
        return t * (2 - t);
      }

      function tick() {
        if (counterDone) {
          renderComplete();
          return;
        }

        var elapsed = Date.now() - start;
        var progress = Math.min(elapsed / 2000, 1);
        var eased = easeOutQuad(progress);
        var val = Math.round(eased * target);

        counterEl.textContent = val + '%';
        if (barEl) barEl.style.width = val + '%';

        if (progress < 1) {
          requestAnimationFrame(function () {
            setTimeout(tick, interval);
          });
        }
      }

      counterEl.textContent = '0%';
      tick();
    }

    function snapCounterTo100() {
      if (!counterEl) return;
      counterDone = true;
      renderComplete();
    }

    var ignoreList = loader.getAttribute('data-loady-ignore');
    if (ignoreList) {
      document.addEventListener('click', function (e) {
        var target = e.target.closest(ignoreList);
        if (target) {
          sessionStorage.setItem(IGNORE_KEY, '1');
        }
      });
    }

    window.addEventListener('load', function () {
      removeLoader('Window Load');
    });
    setTimeout(function () {
      removeLoader('Failsafe');
    }, failsafeTime);
  });
})();
