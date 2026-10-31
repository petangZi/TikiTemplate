/* shared chrome — pinch-zoom lock + page transitions */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = 560; // must match #wipe transition-duration in tiki.css

  /* ---------------- zoom / overscroll lock ---------------- */
  const multi = (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  };
  document.addEventListener("touchstart", multi, { passive: false });
  document.addEventListener("touchmove", multi, { passive: false });

  let lastTap = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTap <= 300) e.preventDefault();
      lastTap = now;
    },
    { passive: false }
  );

  ["gesturestart", "gesturechange", "gestureend"].forEach((name) =>
    document.addEventListener(name, (e) => e.preventDefault(), { passive: false })
  );

  /* ---------------- wipe overlay ---------------- */
  const wipe = document.createElement("div");
  wipe.id = "wipe";
  wipe.setAttribute("aria-hidden", "true");
  document.body.appendChild(wipe);

  const KEY = "tiki:wipe";
  let leaving = false;

  function enter() {
    document.body.classList.remove("enter");
    void document.body.offsetWidth;
    document.body.classList.add("enter");
  }

  /* resolve when #wipe finishes moving — never trust a bare timeout */
  function waitWipe() {
    return new Promise((res) => {
      if (reduce) return res();
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        wipe.removeEventListener("transitionend", fin);
        res();
      };
      wipe.addEventListener("transitionend", fin);
      setTimeout(fin, T + 120); // safety net if the event is dropped
    });
  }

  /* full sweep in, wait until the screen is actually covered */
  function cover() {
    wipe.classList.remove("out", "hold");
    void wipe.offsetWidth;
    wipe.classList.add("in");
    return waitWipe();
  }

  /* panel sweeps away; content entrance starts underneath it */
  function reveal() {
    wipe.classList.remove("in");
    void wipe.offsetWidth; // commit covered position so the exit animates
    wipe.classList.add("out");
    enter();
    return waitWipe();
  }

  /* arriving from another page: screen starts covered, then the panel leaves */
  if (!reduce) {
    let arriving = false;
    try {
      arriving = sessionStorage.getItem(KEY) === "1";
      sessionStorage.removeItem(KEY);
    } catch (_) {}
    if (arriving) {
      wipe.classList.add("hold", "in");
      void wipe.offsetWidth; // painted covered, zero transition
      wipe.classList.remove("hold");
      void wipe.offsetWidth; // commit so the next change animates
      wipe.classList.remove("in");
      wipe.classList.add("out");
      enter();
    }
  }

  addEventListener("pageshow", (e) => {
    if (e.persisted) {
      // bfcache restore: never trust leftover wipe state
      wipe.className = "";
      leaving = false;
    }
    enter();
  });

  /* ---------------- navigation ---------------- */
  document.addEventListener(
    "click",
    (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const a = e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;

      const raw = a.getAttribute("href");
      if (!raw || /^(https?:|mailto:|tel:|javascript:)/i.test(raw)) return;
      if (a.host && a.host !== location.host) return;

      /* in-page section anchors (#engine): native jump, untouched */
      if (raw.startsWith("#") && !raw.startsWith("#/")) return;

      if (leaving) return;
      leaving = true;

      if (raw.startsWith("#/")) {
        /* hash router (v2): cover, swap under the panel, then reveal */
        e.preventDefault();
        cover()
          .then(() => {
            location.hash = raw.slice(1);
            return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          })
          .then(reveal)
          .catch(() => (leaving = false));
        return;
      }

      /* real page link (v1): cover fully, then navigate */
      e.preventDefault();
      try {
        sessionStorage.setItem(KEY, "1");
      } catch (_) {}
      cover()
        .then(() => {
          location.href = a.href;
        })
        .catch(() => (leaving = false));
    },
    true
  );

  /* back/forward on hash routes: swap already happened, dress it with a sweep */
  addEventListener("hashchange", () => {
    if (leaving) return;
    if (wipe.classList.contains("in")) return;
    cover().then(reveal);
  });
})();
