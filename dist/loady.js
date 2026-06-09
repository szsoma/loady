(function () {
  'use strict';

  (function () {

    var IGNORE_KEY = 'loady:ignore';
    var SEEN_KEY = 'loady:seen';

    document.addEventListener('DOMContentLoaded', function () {
      var loader = document.querySelector('[data-loady="container"]');
      if (!loader) return;

      var urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('noloader') === 'true') {
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
      var duration = parseFloat(loader.getAttribute('data-loady-duration')) || 0.5;
      var failsafeTime = parseInt(loader.getAttribute('data-loady-failsafe'), 10) || 5000;
      var minTime = parseInt(loader.getAttribute('data-loady-min'), 10) || 0;
      var isDebug = loader.getAttribute('data-loady-debug') === 'true';

      var startTime = Date.now();
      var perfStart = performance.now();
      var isLoaded = false;
      var counterDone = false;
      var counterEl = loader.querySelector('[data-loady-counter]');

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
          'Duration (s)': duration,
          'Failsafe (ms)': failsafeTime,
          'Min Display (ms)': minTime,
          'Run Once': runOnce,
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

        loader.style.transition = 'all ' + duration + 's ease-in-out';

        switch (animType) {
          case 'fade':
            loader.style.opacity = '0';
            break;
          case 'slide-up':
            loader.style.transform = 'translateY(-100%)';
            break;
          case 'slide-down':
            loader.style.transform = 'translateY(100%)';
            break;
          default:
            loader.style.opacity = '0';
        }

        setTimeout(finish, duration * 1000);
      }

      function finish() {
        observer.disconnect();
        loader.style.display = 'none';
        document.body.removeAttribute('data-loady-status');
        document.body.removeAttribute('aria-busy');
        window.dispatchEvent(new CustomEvent('pageLoady:finished'));
      }

      function finishImmediately() {
        loader.style.display = 'none';
        document.body.removeAttribute('data-loady-status');
        document.body.removeAttribute('aria-busy');
        window.dispatchEvent(new CustomEvent('pageLoady:finished'));
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
            counterEl.textContent = '100%';
            return;
          }

          var elapsed = Date.now() - start;
          var progress = Math.min(elapsed / 2000, 1);
          var eased = easeOutQuad(progress);
          var val = Math.round(eased * target);

          counterEl.textContent = val + '%';

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
        counterEl.textContent = '100%';
      }

      window.addEventListener('load', function () {
        removeLoader('Window Load');
      });
      setTimeout(function () {
        removeLoader('Failsafe');
      }, failsafeTime);
    });

    document.addEventListener('click', function (e) {
      var container = document.querySelector('[data-loady="container"]');
      if (!container) return;

      var ignoreList = container.getAttribute('data-loady-ignore');
      if (!ignoreList) return;

      var target = e.target.closest(ignoreList);
      if (target) {
        sessionStorage.setItem(IGNORE_KEY, '1');
      }
    });
  })();

})();
