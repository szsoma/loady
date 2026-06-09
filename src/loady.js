(function () {
  'use strict';

  var IGNORE_KEY = 'loady:ignore';

  document.addEventListener('DOMContentLoaded', function () {
    var loader = document.querySelector('[data-loady="container"]');
    if (!loader) return;

    if (sessionStorage.getItem(IGNORE_KEY) === '1') {
      sessionStorage.removeItem(IGNORE_KEY);
      finishImmediately();
      return;
    }

    var animType = loader.getAttribute('data-loady-anim') || 'fade';
    var duration = parseFloat(loader.getAttribute('data-loady-duration')) || 0.5;
    var failsafeTime = parseInt(loader.getAttribute('data-loady-failsafe'), 10) || 5000;
    var minTime = parseInt(loader.getAttribute('data-loady-min'), 10) || 0;

    var startTime = Date.now();
    var isLoaded = false;
    var counterDone = false;
    var counterEl = loader.querySelector('[data-loady-counter]');

    document.body.setAttribute('data-loady-status', 'loading');
    document.body.setAttribute('aria-busy', 'true');

    startCounter();

    function removeLoader() {
      if (isLoaded) return;
      isLoaded = true;

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

    window.addEventListener('load', removeLoader);
    setTimeout(removeLoader, failsafeTime);
  });

  document.addEventListener('click', function (e) {
    var ignoreSelector = '[data-loady-ignore]';
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
