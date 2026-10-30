/* landing page — hero runner, terminal, lab feed, reveal */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- hero ascii runner
  const canvas = document.getElementById("hero-ascii");
  let runner = null;
  if (canvas && window.TikiAscii && window.TIKI_SCENE) {
    runner = TikiAscii(canvas, { scene: window.TIKI_SCENE, cell: 11 });
  }

  // ---- terminal
  const term = document.getElementById("heroTerm");
  const LINES = [
    { p: "$ ", t: "tiki run --scope acme-core --profile deep", c: "cmd" },
    { p: "→ ", t: "planner  4 hosts · 2 authenticated · budget 200k", c: "dim" },
    { p: "✓ ", t: "recon    nmap 10.0.4.0/24              2.1s", c: "ok" },
    { p: "✓ ", t: "fuzz     ffuf /api/*                    0.9s", c: "ok" },
    { p: "! ", t: "finding  auth bypass @ /api/v2/user", c: "hl" },
    { p: "→ ", t: "chain    idor → admin token → rce", c: "dim" },
    { p: "✓ ", t: "report   reports/acme-core.md          0.3s", c: "ok" },
  ];

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  if (term) {
    if (reduce) {
      term.innerHTML = LINES.map((l) => `<span class="${l.c}">${esc(l.p + l.t)}</span>`).join("\n");
    } else {
      let li = 0, ci = 0, done = "";
      const step = () => {
        if (li >= LINES.length) {
          term.innerHTML = done + '<span class="caret"></span>';
          setTimeout(() => { li = 0; ci = 0; done = ""; step(); }, 5200);
          return;
        }
        const line = LINES[li];
        ci++;
        const partial = esc(line.t.slice(0, ci));
        term.innerHTML = done + `<span class="${line.c}">${esc(line.p)}${partial}</span><span class="caret"></span>`;
        if (ci >= line.t.length) {
          done += `<span class="${line.c}">${esc(line.p + line.t)}</span>\n`;
          li++; ci = 0;
          setTimeout(step, li === 1 ? 420 : 120);
        } else {
          setTimeout(step, li === 0 ? 38 : 9);
        }
      };
      setTimeout(step, 700);
    }
  }

  // ---- ticker: duplicate the half so -50% loops seamlessly
  const ticker = document.getElementById("ticker");
  if (ticker) ticker.innerHTML += ticker.innerHTML;

  // ---- lab feed
  const feed = document.getElementById("labFeed");
  const TOOLS = [
    ["tool.bash", "nmap -sV -p- 10.0.4.12", "done"],
    ["tool.grep", "\"password\\s*=\" src/**", "done"],
    ["subagent", "recon-web · 3 hosts queued", "run"],
    ["tool.browser", "GET /api/v2/user?id=1", "done"],
    ["tool.edit", "patch auth/session.ts +12 −3", "done"],
    ["tool.bash", "ffuf -w raft -u /api/FUZZ", "run"],
    ["subagent", "exploit-chain · payload build", "run"],
    ["tool.report", "severity: critical · 2 high", "done"],
    ["tool.bash", "curl -X POST /api/v2/login", "done"],
    ["tool.browser", "verify token scope → admin", "done"],
  ];
  const stamp = () => {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  };

  if (feed) {
    let i = 0;
    const push = () => {
      const [tool, arg, st] = TOOLS[i % TOOLS.length];
      i++;
      const row = document.createElement("div");
      row.className = "act-row" + (st === "run" ? " busy" : "");
      row.innerHTML =
        `<span class="t">${stamp()}</span>` +
        `<span class="tool">${tool}</span>` +
        `<span class="arg">${arg}</span>` +
        `<span class="st ${st}">${st === "run" ? "running" : "exit 0"}</span>`;
      feed.appendChild(row);
      while (feed.children.length > 8) feed.removeChild(feed.firstElementChild);
    };
    for (let k = 0; k < 7; k++) push();
    if (!reduce) setInterval(push, 1700);
  }

  // ---- reveal on scroll
  const items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add("in"));
  }

  // ---- idle activity drift so the run never freezes
  if (runner && !reduce) {
    let a = 0.55;
    setInterval(() => { a = 0.45 + Math.random() * 0.5; runner.setActivity(a); }, 2600);
  }

  addEventListener("pagehide", () => { if (runner) runner.dispose(); });
})();
