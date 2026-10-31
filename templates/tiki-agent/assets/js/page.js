/* shared chrome — pinch-zoom lock + page transitions */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  function cover() {
    wipe.classList.remove("out", "hold");
    void wipe.offsetWidth;
    wipe.classList.add("in");
  }

  function reveal() {
    wipe.classList.remove("in");
    wipe.classList.add("out");
    enter();
  }

  /* arriving from another page: overflow the overlay, then sweep it away */
  if (!reduce) {
    let arriving = false;
    try {
      arriving = sessionStorage.getItem(KEY) === "1";
      sessionStorage.removeItem(KEY);
    } catch (_) {}
    if (arriving) {
      wipe.classList.add("hold", "in");
      requestAnimationFrame(() => {
        wipe.classList.remove("hold");
        requestAnimationFrame(() => {
          wipe.classList.remove("in");
          wipe.classList.add("out");
        });
      });
    }
  }

  addEventListener("pageshow", enter);

  /* full page navigation: cover, then move */
  document.addEventListener(
    "click",
    (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const a = e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;

      const raw = a.getAttribute("href");
      if (!raw || raw.startsWith("#") || /^(https?:|mailto:|tel:|javascript:)/i.test(raw)) return;
      if (a.host && a.host !== location.host) return;

      e.preventDefault();
      if (leaving) return;
      leaving = true;
      try {
        sessionStorage.setItem(KEY, "1");
      } catch (_) {}
      cover();
      setTimeout(() => (location.href = a.href), reduce ? 0 : 330);
    },
    true
  );

  /* in-document routing (hash views): wipe around the swap */
  addEventListener("hashchange", () => {
    if (leaving) return;
    cover();
    setTimeout(reveal, reduce ? 0 : 300);
  });
})();
