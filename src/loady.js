(function () {
  'use strict';

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

    var cleanupRefs = {};

    var gen = (window._loadyGen = (window._loadyGen || 0) + 1);

    var skipGSAP = loader.getAttribute('data-loady-gsap') === 'false';
    if (!skipGSAP) pauseGSAP();

    var viewTransition = loader.getAttribute('data-loady-view-transition');

    var skipIX2 = loader.getAttribute('data-loady-ix2') === 'false';
    var forceIX2 = !!viewTransition;
    if (!skipIX2 || forceIX2) pauseIX2();

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('noloader') === 'true') {
      sessionStorage.removeItem(SEEN_KEY);
      sessionStorage.removeItem(IGNORE_KEY);
      completeLoader();
      return;
    }

    var runOnce = loader.getAttribute('data-loady-once') === 'true';
    if (runOnce && sessionStorage.getItem(SEEN_KEY) === 'true') {
      completeLoader();
      return;
    }
    if (runOnce) {
      sessionStorage.setItem(SEEN_KEY, 'true');
    }

    if (sessionStorage.getItem(IGNORE_KEY) === '1') {
      sessionStorage.removeItem(IGNORE_KEY);
      completeLoader();
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

    var thresholdVal = parseFloat(loader.getAttribute('data-loady-threshold'));
    var threshold = (isNaN(thresholdVal) || thresholdVal <= 0 || thresholdVal > 1) ? 1 : thresholdVal;

    var outboundAnim = loader.getAttribute('data-loady-outbound');
    var prefetchEnabled = loader.getAttribute('data-loady-prefetch') === 'true';
    var ignoreList = loader.getAttribute('data-loady-ignore');

    var vtSupported = typeof document.startViewTransition === 'function';
    var vtEnabled = viewTransition && vtSupported;

    function isQualifyingLink(anchor) {
      if (!anchor || anchor.tagName !== 'A') return false;
      if (!anchor.href || anchor.href === '') return false;
      if (anchor.target && anchor.target !== '_self') return false;
      if (anchor.getAttribute('href').charAt(0) === '#') return false;
      if (anchor.href === window.location.href) return false;
      try {
        var url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return false;
      } catch (e) {
        return false;
      }
      if (ignoreList && anchor.matches(ignoreList)) return false;
      return true;
    }

    if (ignoreList || outboundAnim) {
      document.addEventListener('click', function (e) {
        if (ignoreList && e.target.closest(ignoreList)) {
          sessionStorage.setItem(IGNORE_KEY, '1');
          return;
        }

        var anchor = e.target.closest('a');
        if (!anchor) return;

        if (!outboundAnim || !isQualifyingLink(anchor)) return;

        e.preventDefault();
        var destinationUrl = anchor.href;

        var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
          window.location.href = destinationUrl;
          return;
        }

        if (vtEnabled && viewTransition === 'true') {
          document.startViewTransition(function () {
            window.location.href = destinationUrl;
          });
          return;
        }

        document.body.setAttribute('aria-busy', 'true');
        document.body.setAttribute('data-loady-status', 'loading');

        loader.style.transition = 'none';
        loader.style.display = 'flex';
        loader.style.opacity = '';
        loader.style.transform = '';

        switch (outboundAnim) {
          case 'slide-down':
            loader.style.transform = 'translateY(-100%)';
            break;
          case 'slide-up':
            loader.style.transform = 'translateY(100%)';
            break;
          case 'fade':
          default:
            loader.style.opacity = '0';
        }

        void loader.offsetHeight;

        loader.style.transition = buildTransition(duration, easing);

        switch (outboundAnim) {
          case 'slide-down':
          case 'slide-up':
            loader.style.transform = 'translateY(0)';
            break;
          case 'fade':
          default:
            loader.style.opacity = '1';
        }

        function doNavigate() {
          if (vtEnabled && viewTransition === 'persistent') {
            document.startViewTransition(function () {
              window.location.href = destinationUrl;
            });
          } else {
            window.location.href = destinationUrl;
          }
        }

        var navigated = false;
        var failsafe = setTimeout(function () {
          if (!navigated) {
            navigated = true;
            doNavigate();
          }
        }, (duration * 1000) + 500);

        loader.addEventListener('transitionend', function () {
          if (!navigated) {
            navigated = true;
            clearTimeout(failsafe);
            doNavigate();
          }
        }, { once: true });
      });
    }

    if (prefetchEnabled) {
      function prefetch(url) {
        if (document.querySelector('link[rel="prefetch"][href="' + url + '"]')) return;
        var link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.setAttribute('as', 'document');
        document.head.appendChild(link);
      }

      document.addEventListener('mouseover', function (e) {
        var anchor = e.target.closest('a');
        if (!anchor || !isQualifyingLink(anchor)) return;

        var connection = navigator.connection;
        if (connection) {
          if (connection.saveData) return;
          if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return;
        }

        var timer = setTimeout(function () {
          prefetch(anchor.href);
        }, 80);

        anchor.addEventListener('mouseleave', function () {
          clearTimeout(timer);
        }, { once: true });
      });
    }

    var startTime = Date.now();
    var perfStart = performance.now();
    var isLoaded = false;
    var counterDone = false;
    var counterEl = loader.querySelector('[data-loady-counter]');
    var barEl = loader.querySelector('[data-loady-bar]');

    if (vtEnabled) {
      loader.style.setProperty('--loady-duration', duration + 's');
      loader.style.setProperty('--loady-easing', easing);
      if (viewTransition === 'persistent') {
        loader.style.viewTransitionName = 'loady-container';
        loader.style.contain = 'layout';
      }
    }

    if (viewTransition) {
      var vtStyle = document.createElement('style');
      vtStyle.setAttribute('data-loady-vt', '');
      vtStyle.textContent = '@view-transition { navigation: auto; }';
      document.head.appendChild(vtStyle);
    }

    var percent = 0;
    var displayedPercent = 0;
    var phase = 'loading';
    var loadedCount = 0;
    var totalCount = 0;
    var tickCancelled = false;

    function dispatchProgress(pct, ph) {
      if (gen !== window._loadyGen) return;
      window.dispatchEvent(new CustomEvent('pageLoady:progress', {
        detail: { percent: pct, raw: +(pct / 100).toFixed(4), phase: ph },
      }));
    }

    document.body.setAttribute('data-loady-status', 'loading');
    document.body.setAttribute('aria-busy', 'true');

    startProgress();
    initAssetTracking();

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

    function buildTransition(dur, ease) {
      return 'opacity ' + dur + 's ' + ease + ', transform ' + dur + 's ' + ease;
    }

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
      if (remaining > 0) phase = 'min-wait';

      setTimeout(animateOut, remaining);
    }

    function animateOut() {
      phase = 'animating';
      percent = 100;
      snapCounterTo100();

      loader.style.transition = buildTransition(duration, easing);

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

      setTimeout(completeLoader, duration * 1000);
    }

    function cleanupLoader() {
      loader.style.display = 'none';
      document.body.removeAttribute('data-loady-status');
      document.body.removeAttribute('aria-busy');
      if (observer) observer.disconnect();
      if (cleanupRefs.pageshow) window.removeEventListener('pageshow', cleanupRefs.pageshow);
      tickCancelled = true;
      if (gen === window._loadyGen) {
        window.dispatchEvent(new CustomEvent('pageLoady:finished'));
      }
    }

    function completeLoader() {
      phase = 'animating';
      dispatchProgress(100, 'animating');
      resumeGSAP();
      resumeIX2();
      cleanupLoader();
    }

    function renderComplete() {
      if (counterEl) counterEl.textContent = '100%';
      if (barEl) barEl.style.width = '100%';
    }

    function startProgress() {
      var fps = 30;
      var interval = 1000 / fps;

      function tick() {
        if (tickCancelled || counterDone) {
          renderComplete();
          return;
        }

        var target = Math.min(percent, 85);
        if (target === 0) target = 85;
        if (displayedPercent < target) {
          displayedPercent = Math.min(displayedPercent + 0.5, target);
        }

        var displayVal = Math.round(displayedPercent);

        if (counterEl) counterEl.textContent = displayVal + '%';
        if (barEl) barEl.style.width = displayVal + '%';

        dispatchProgress(Math.min(percent, 85), phase);

        requestAnimationFrame(function () {
          setTimeout(tick, interval);
        });
      }

      if (counterEl) counterEl.textContent = '0%';
      tick();
    }

    function onAssetResolved() {
      loadedCount++;
      if (totalCount === 0) {
        percent = 85;
      } else {
        percent = Math.round((loadedCount / totalCount) * 85);
      }
      dispatchProgress(Math.min(percent, 85), phase);
      if (totalCount > 0 && (loadedCount / totalCount) >= threshold) {
        removeLoader('Threshold');
      }
    }

    function initAssetTracking() {
      var assets = document.querySelectorAll('img, iframe, video[src], script[src]');
      totalCount = assets.length;

      if (totalCount === 0) {
        percent = 85;
        removeLoader('No Assets');
        return;
      }

      for (var i = 0; i < assets.length; i++) {
        (function (el) {
          if (el.tagName === 'IMG' && el.complete) {
            onAssetResolved();
            return;
          }
          el.addEventListener('load', onAssetResolved);
          el.addEventListener('error', onAssetResolved);
        })(assets[i]);
      }
    }

    function snapCounterTo100() {
      if (!counterEl) return;
      counterDone = true;
      displayedPercent = 100;
      renderComplete();
    }


    window.addEventListener('load', function () {
      removeLoader('Window Load');
    });
    setTimeout(function () {
      removeLoader('Failsafe');
    }, failsafeTime);

    cleanupRefs.pageshow = function (event) {
      if (event.persisted) {
        resumeGSAP();
        resumeIX2();
        cleanupLoader();
      }
    };
    window.addEventListener('pageshow', cleanupRefs.pageshow);
  });
})();
