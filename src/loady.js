/*made by Soma Szoboszlai*/
(function () {
  "use strict";

  var L = window.__loadyDebug
    ? console
    : { log: function () {}, warn: function () {}, error: function () {} };

  function log(msg) {
    L.log(
      "%c[Loady]%c " + msg,
      "color:#bada55;font-weight:bold",
      "color:inherit",
    );
  }
  function warn(msg) {
    L.warn("[Loady] " + msg);
  }
  function err(msg) {
    L.error("[Loady] " + msg);
  }

  var IGNORE_KEY = "loady:ignore";
  var SEEN_KEY = "loady:seen";

  var isNavigating = false;
  var prefetchTimers = new WeakMap();
  var observer = null;

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
    if (window.Webflow && typeof window.Webflow.require === "function") {
      ix2Engine = window.Webflow.require("ix2");
      if (ix2Engine) ix2Engine.destroy();
    }
  }

  function resumeIX2() {
    if (ix2Engine) {
      ix2Engine.init();
      ix2Engine = null;
    }
  }

  function cleanupAllObservers() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function safeWrap(fn, fallback) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        err("Handler error: " + e.message);
        if (fallback) fallback.apply(this, arguments);
      }
    };
  }

  document.addEventListener("DOMContentLoaded", function () {
    var loader = document.querySelector('[data-loady="container"]');
    if (!loader) return;

    var domCache = {
      loader: loader,
      counter: loader.querySelector("[data-loady-counter]"),
      bar: loader.querySelector("[data-loady-bar]")
    };

    try {
      var cleanupRefs = {};

      var gen = (window._loadyGen = (window._loadyGen || 0) + 1);

      var skipGSAP = domCache.loader.getAttribute("data-loady-gsap") === "false";
      try {
        if (!skipGSAP) pauseGSAP();
      } catch (e) {}

      var viewTransition = domCache.loader.getAttribute("data-loady-view-transition");

      var skipIX2 = domCache.loader.getAttribute("data-loady-ix2") === "false";
      var forceIX2 = !!viewTransition;
      try {
        if (!skipIX2 || forceIX2) pauseIX2();
      } catch (e) {}

      var urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("noloader") === "true") {
        sessionStorage.removeItem(SEEN_KEY);
        sessionStorage.removeItem(IGNORE_KEY);
        resumeGSAP();
        resumeIX2();
        cleanupAllObservers();
        completeLoader("noloader");
        return;
      }

      var runOnce = domCache.loader.getAttribute("data-loady-once") === "true";
      if (runOnce && sessionStorage.getItem(SEEN_KEY) === "true") {
        resumeGSAP();
        resumeIX2();
        cleanupAllObservers();
        completeLoader("normal");
        return;
      }
      if (runOnce) {
        sessionStorage.setItem(SEEN_KEY, "true");
      }

      if (sessionStorage.getItem(IGNORE_KEY) === "1") {
        sessionStorage.removeItem(IGNORE_KEY);
        resumeGSAP();
        resumeIX2();
        cleanupAllObservers();
        completeLoader("normal");
        return;
      }

      var durationVal = parseFloat(domCache.loader.getAttribute("data-loady-duration"));
      var duration = isNaN(durationVal) ? 0.5 : durationVal;
      if (duration < 0.1 && duration !== 0) duration = 0.1;

      if (duration === 0) {
        resumeGSAP();
        resumeIX2();
        cleanupAllObservers();
        completeLoader("normal");
        return;
      }

      var animType = domCache.loader.getAttribute("data-loady-anim") || "fade";
      var failsafeVal = parseInt(
        domCache.loader.getAttribute("data-loady-failsafe"),
        10,
      );
      var failsafeTime = isNaN(failsafeVal) ? 5000 : failsafeVal;
      var minVal = parseInt(domCache.loader.getAttribute("data-loady-min"), 10);
      var minTime = isNaN(minVal) ? 0 : minVal;
      var isDebug = domCache.loader.getAttribute("data-loady-debug") === "true";
      var easing = domCache.loader.getAttribute("data-loady-easing") || "ease-in-out";

      var thresholdVal = parseFloat(
        domCache.loader.getAttribute("data-loady-threshold"),
      );
      var threshold =
        isNaN(thresholdVal) || thresholdVal <= 0 || thresholdVal > 1
          ? 1
          : thresholdVal;

      var outboundAnim = domCache.loader.getAttribute("data-loady-outbound");
      var prefetchEnabled =
        domCache.loader.getAttribute("data-loady-prefetch") === "true";
      var ignoreList = domCache.loader.getAttribute("data-loady-ignore");

      try {
        var vtSupported = typeof document.startViewTransition === "function";
      } catch (e) {
        var vtSupported = false;
      }
      var vtEnabled = viewTransition && vtSupported;

      function isQualifyingLink(anchor) {
        if (!anchor || anchor.tagName !== "A") return false;
        if (!anchor.href || anchor.href === "") return false;
        if (anchor.target && anchor.target !== "_self") return false;
        if (anchor.getAttribute("href").charAt(0) === "#") return false;
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
        document.addEventListener(
          "click",
          safeWrap(function (e) {
            if (ignoreList && e.target.closest(ignoreList)) {
              sessionStorage.setItem(IGNORE_KEY, "1");
              return;
            }

            var anchor = e.target.closest("a");
            if (!anchor) return;

            if (!outboundAnim || !isQualifyingLink(anchor)) return;

            if (isNavigating) return;

          e.preventDefault();
          isNavigating = true;
          var destinationUrl = anchor.href;

          var prefersReducedMotion =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (prefersReducedMotion) {
            isNavigating = false;
            window.location.href = destinationUrl;
            return;
          }

          if (vtEnabled && viewTransition === "true") {
            document.startViewTransition(function () {
              window.location.href = destinationUrl;
            });
            return;
          }

          document.body.setAttribute("aria-busy", "true");
          document.body.setAttribute("data-loady-status", "loading");

          domCache.loader.style.transition = "none";
          domCache.loader.style.display = "flex";
          domCache.loader.style.opacity = "";
          domCache.loader.style.transform = "";

          setAnimState(domCache.loader, outboundAnim, "initial", "outbound");

          void domCache.loader.offsetHeight;

          domCache.loader.style.transition = buildTransition(duration, easing);

          setAnimState(domCache.loader, outboundAnim, "final", "outbound");

          function doNavigate() {
            isNavigating = false;
            if (vtEnabled && viewTransition === "persistent") {
              document.startViewTransition(function () {
                window.location.href = destinationUrl;
              });
            } else {
              window.location.href = destinationUrl;
            }
          }

          var navigated = false;
          var failsafe = setTimeout(
            function () {
              if (!navigated) {
                navigated = true;
                doNavigate();
              }
            },
            duration * 1000 + 500,
          );

          domCache.loader.addEventListener(
            "transitionend",
            function () {
              if (!navigated) {
                navigated = true;
                clearTimeout(failsafe);
                doNavigate();
              }
            },
            { once: true },
          );
        }, function () {
          isNavigating = false;
        }));
      }

      if (prefetchEnabled) {
        function prefetch(url) {
          if (
            document.querySelector('link[rel="prefetch"][href="' + url + '"]')
          )
            return;
          var link = document.createElement("link");
          link.rel = "prefetch";
          link.href = url;
          link.setAttribute("as", "document");
          document.head.appendChild(link);
          log("Prefetched: " + url);
          if (isDebug) console.log(link);
        }

        document.addEventListener(
          "mouseover",
          safeWrap(function (e) {
            var anchor = e.target.closest("a");
            if (!anchor || !isQualifyingLink(anchor)) return;

          var connection = navigator.connection;
          if (connection) {
            if (connection.saveData) return;
            if (
              connection.effectiveType === "slow-2g" ||
              connection.effectiveType === "2g"
            )
              return;
          }

          var timer = setTimeout(function () {
            prefetch(anchor.href);
            prefetchTimers.delete(anchor);
          }, 80);

          prefetchTimers.set(anchor, timer);

          anchor.addEventListener(
            "mouseleave",
            function () {
              clearTimeout(prefetchTimers.get(anchor));
              prefetchTimers.delete(anchor);
            },
            { once: true },
          );
        }, null));

        document.addEventListener(
          "touchstart",
          safeWrap(function (e) {
            var anchor = e.target.closest("a");
            if (!anchor || !isQualifyingLink(anchor)) return;

            var connection = navigator.connection;
            if (connection) {
              if (connection.saveData) return;
              if (
                connection.effectiveType === "slow-2g" ||
                connection.effectiveType === "2g"
              )
                return;
            }

            var timer = setTimeout(function () {
              prefetch(anchor.href);
              prefetchTimers.delete(anchor);
            }, 80);

            prefetchTimers.set(anchor, timer);

            var onEnd = function () {
              clearTimeout(prefetchTimers.get(anchor));
              prefetchTimers.delete(anchor);
            };
            anchor.addEventListener("touchend", onEnd, { once: true });
            anchor.addEventListener("touchcancel", onEnd, { once: true });
          }, null),
        );
      }

      var startTime = Date.now();
      var perfStart = performance.now();
      var isLoaded = false;
      var counterDone = false;
      var counterEl = domCache.counter;
      var barEl = domCache.bar;

      if (vtEnabled) {
        domCache.loader.style.setProperty("--loady-duration", duration + "s");
        domCache.loader.style.setProperty("--loady-easing", easing);
        if (viewTransition === "persistent") {
          domCache.loader.style.viewTransitionName = "loady-container";
          domCache.loader.style.contain = "layout";
        }
      }

      if (viewTransition) {
        var vtStyle = document.createElement("style");
        vtStyle.setAttribute("data-loady-vt", "");
        vtStyle.textContent = "@view-transition { navigation: auto; }";
        document.head.appendChild(vtStyle);
      }

      var percent = 0;
      var displayedPercent = 0;
      var phase = "loading";
      var loadedCount = 0;
      var totalCount = 0;
      var tickCancelled = false;

      function dispatchProgress(pct, ph) {
        if (gen !== window._loadyGen) return;
        window.dispatchEvent(
          new CustomEvent("pageLoady:progress", {
            detail: { percent: pct, raw: +(pct / 100).toFixed(4), phase: ph },
          }),
        );
      }

      document.body.setAttribute("data-loady-status", "loading");
      document.body.setAttribute("aria-busy", "true");

      startProgress();
      initAssetTracking();

      function hideGsapEl(el) {
        el.style.visibility = "hidden";
        el.style.opacity = "0";
      }

      function trackImage(img) {
        totalCount++;
        if (img.complete) {
          onAssetResolved();
          return;
        }
        img.addEventListener("load", onAssetResolved, { once: true });
        img.addEventListener("error", onAssetResolved, { once: true });
      }

      observer = new MutationObserver(function (mutationsList) {
        mutationsList.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.hasAttribute("data-gsap-hide")) hideGsapEl(node);
            node.querySelectorAll("[data-gsap-hide]").forEach(hideGsapEl);
            if (node.tagName === "IMG") trackImage(node);
            node.querySelectorAll("img").forEach(trackImage);
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      function buildTransition(dur, ease) {
        return (
          "opacity " + dur + "s " + ease + ", transform " + dur + "s " + ease
        );
      }

      function setAnimState(el, anim, phase, context) {
        var isSlide = anim === "slide-up" || anim === "slide-down";
        if (!isSlide) {
          el.style.opacity = phase === "initial" ? "0" : "1";
          return;
        }
        if (phase === "final") {
          el.style.transform = "translateY(0)";
          return;
        }
        // phase === 'initial'
        if (context === "outbound") {
          // Outbound: slide-down starts above, slide-up starts below
          var dir = anim === "slide-down" ? "-100%" : "100%";
          el.style.transform = "translateY(" + dir + ")";
        } else {
          // animateOut: slide-up goes up, slide-down goes down
          var dir = anim === "slide-up" ? "-100%" : "100%";
          el.style.transform = "translateY(" + dir + ")";
        }
      }

      function logDebug(triggerSource) {
        if (!isDebug) return;
        var timeTaken = ((performance.now() - perfStart) / 1000).toFixed(2);
        console.groupCollapsed(
          "%c Loady Debug",
          "background: #222; color: #bada55; padding: 4px; border-radius: 4px;",
        );
        console.table({
          "Trigger Source": triggerSource,
          "Time Taken (s)": timeTaken,
          "Animation Type": animType,
          Easing: easing,
          "Duration (s)": duration,
          "Failsafe (ms)": failsafeTime,
          "Min Display (ms)": minTime,
          Threshold: threshold,
          "Run Once": runOnce,
          Prefetch: prefetchEnabled,
          "Outbound Anim": outboundAnim || "none",
          "View Transition": viewTransition || "off",
          "Assets Tracked": totalCount,
          "Assets Loaded": loadedCount,
          "GSAP Paused": !skipGSAP && !!gsapTL,
          "IX2 Paused": !skipIX2 && !!ix2Engine,
        });
        console.groupEnd();
      }

      function removeLoader(triggerSource) {
        if (isLoaded) return;
        isLoaded = true;
        logDebug(triggerSource);

        var elapsed = Date.now() - startTime;
        var remaining = Math.max(0, minTime - elapsed);
        if (remaining > 0) phase = "min-wait";

        setTimeout(animateOut, remaining);
      }

      function animateOut() {
        phase = "animating";
        percent = 100;
        if (!counterEl && !barEl) {
          counterDone = true;
        }

        domCache.loader.style.transition = buildTransition(duration, easing);

        setAnimState(domCache.loader, animType, "initial", "animateOut");

        setTimeout(function () {
          if (!counterDone) {
            counterDone = true;
            renderComplete();
          }
          completeLoader("normal");
        }, duration * 1000);
      }

      function cleanupLoader(source) {
        domCache.loader.style.display = "none";
        document.body.removeAttribute("data-loady-status");
        document.body.removeAttribute("aria-busy");
        if (observer) observer.disconnect();
        tickCancelled = true;
        document.querySelectorAll("[data-gsap-hide]").forEach(function (el) {
          el.style.visibility = "visible";
          el.style.opacity = "1";
        });
        if (gen === window._loadyGen) {
          window.dispatchEvent(
            new CustomEvent("pageLoady:finished", {
              detail: { source: source },
            }),
          );
        }
      }

      function completeLoader(source) {
        cleanupAllObservers();
        phase = source === "normal" || source === "noloader" ? "complete" : "animating";
        dispatchProgress(100, phase);
        resumeGSAP();
        resumeIX2();
        cleanupLoader(source);
      }

      function renderComplete() {
        if (counterEl) counterEl.textContent = "100%";
        if (barEl) barEl.style.width = "100%";
      }

      function startProgress() {
        var fps = 30;
        var interval = 1000 / fps;

        function tick() {
          if (tickCancelled || counterDone) {
            renderComplete();
            return;
          }

          var target, increment;
          if (phase === "animating") {
            target = 100;
            increment = Math.max(0.1, 15 / duration);
          } else {
            target = Math.min(percent, 85);
            if (target === 0) target = 85;
            increment = 0.5;
          }
          var next = displayedPercent + increment;
          displayedPercent = Math.max(displayedPercent, Math.min(next, target));

          var displayVal = Math.round(Math.min(displayedPercent, 100));

          if (counterEl) counterEl.textContent = displayVal + "%";
          if (barEl) barEl.style.width = displayVal + "%";

          if (phase !== "animating") {
            dispatchProgress(Math.min(percent, 85), phase);
          }

          requestAnimationFrame(function () {
            setTimeout(tick, interval);
          });
        }

        if (counterEl) counterEl.textContent = "0%";
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
        if (totalCount > 0 && loadedCount / totalCount >= threshold) {
          removeLoader("Threshold");
        }
      }

      function initAssetTracking() {
        totalCount = 0;

        var imgs = document.querySelectorAll("img");
        imgs.forEach(function (img) {
          trackImage(img);
        });

        var nonImgs = document.querySelectorAll(
          "iframe, video[src], script[src]",
        );
        nonImgs.forEach(function (el) {
          totalCount++;
          el.addEventListener("load", onAssetResolved, { once: true });
          el.addEventListener("error", onAssetResolved, { once: true });
        });

        if (totalCount === 0) {
          percent = 85;
          removeLoader("No Assets");
        }
      }

      function handleWindowLoad() {
        if (document.readyState === "complete") {
          removeLoader("Window Load");
        } else {
          window.addEventListener("load", function () {
            removeLoader("Window Load");
          }, { once: true });
        }
      }
      handleWindowLoad();
      setTimeout(function () {
        removeLoader("Failsafe");
      }, failsafeTime);

      cleanupRefs.pageshow = function (event) {
        if (event.persisted) {
          resumeGSAP();
          resumeIX2();
          cleanupLoader("bfcache");
        }
      };
      window.addEventListener("pageshow", cleanupRefs.pageshow);
    } catch (e) {
      console.error("[Loady] Initialization failed:", e);
    }
  });
})();
