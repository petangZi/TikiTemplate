/* tiki agent — console runtime: thread, live activity rail, palette */
window.TikiConsole = () => {
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stream = $("#stream");
  const input = $("#input");
  const sendBtn = $("#sendBtn");
  const logEl = $("#log");
  const todoEl = $("#todo");

  const state = {
    running: false,
    aborted: false,
    tools: 0,
    ctx: 26,
    step: 1,
    speed: 1,
    started: Date.now(),
  };

  let lastBody = null;
  let runner = null;
  const miniCanvas = $("#mini-ascii");
  if (miniCanvas && window.TikiAscii && window.TIKI_SCENE) {
    runner = TikiAscii(miniCanvas, { scene: window.TIKI_SCENE, cell: 8, compact: true });
  }

  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const clock = () => {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  };
  const jitter = (a, b) => a + Math.random() * (b - a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function pinScroll() {
    stream.scrollTop = stream.scrollHeight;
  }

  /* ---------------- activity rail ---------------- */

  function logLine(kind, key, value) {
    const row = document.createElement("div");
    row.className = "e " + kind;
    row.innerHTML = `<time>${clock()}</time><span class="k">${esc(key)}</span><span class="v">${esc(value)}</span>`;
    logEl.appendChild(row);
    while (logEl.children.length > 40) logEl.removeChild(logEl.firstElementChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setNow(tool, desc, cmd, pct, elapsed) {
    $("#nowTool").textContent = tool;
    $("#nowDesc").textContent = desc;
    $("#nowCmd").textContent = cmd;
    $("#progBar").style.width = Math.max(4, Math.min(100, pct)) + "%";
    if (elapsed !== undefined) $("#nowElapsed").textContent = elapsed;
    $("#stepVal").textContent = String(state.step);
  }

  function setRunning(on) {
    state.running = on;
    const pill = $("#agentPill");
    pill.classList.toggle("idle", !on);
    $("#agentPillText").textContent = on ? "running" : "idle";
    $("#miniState").textContent = on ? "running" : "idle";
    $("#runState").textContent = on ? "streaming" : "idle";
    $("#speedVal").textContent = on ? state.speed.toFixed(1) + "×" : "0.0×";
    if (runner) runner.setActivity(on ? 0.85 : 0.12);
  }

  function bumpContext() {
    state.ctx = Math.min(99, state.ctx + 1);
    $("#ctxVal").textContent = state.ctx + "%";
    $("#mCtx").textContent = state.ctx + "%";
  }

  function tickTools() {
    state.tools++;
    $("#mTools").textContent = String(state.tools);
    $("#mLat").textContent = Math.round(jitter(11, 58)) + "ms";
  }

  const todoProgress = () => {
    const done = todoEl.querySelectorAll("li.done").length;
    $("#planCount").textContent = `${done} / ${todoEl.children.length}`;
  };

  function advanceTodo() {
    const current = todoEl.querySelector("li.now");
    if (!current) return;
    current.className = "done";
    current.querySelector(".bx").textContent = "✓";
    const next = current.nextElementSibling;
    if (next) next.className = "now";
    todoProgress();
  }

  /* ---------------- thread rendering ---------------- */

  function addMsg(role) {
    const el = document.createElement("article");
    el.className = "msg " + role;
    const who = role === "user" ? "bos" : "tiki";
    const av = role === "user" ? "B" : "T";
    el.innerHTML = `<div class="avatar">${av}</div>
      <div>
        <div class="who"><b>${who}</b><span>${role === "user" ? "operator" : "agent · flash runtime"}</span><time>${clock()}</time></div>
        <div class="body"></div>
      </div>`;
    stream.appendChild(el);
    pinScroll();
    lastBody = el.querySelector(".body");
    return lastBody;
  }

  async function type(el, text, cps = 90) {
    const span = document.createElement("span");
    const caret = document.createElement("span");
    caret.className = "stream-caret";
    el.appendChild(span);
    el.appendChild(caret);
    if (reduce) {
      span.textContent = text;
      caret.remove();
      return;
    }
    const step = Math.max(1, Math.round(text.length / ((text.length / cps) * 60)));
    for (let i = 0; i < text.length; i += step) {
      if (state.aborted) break;
      span.textContent = text.slice(0, i + step);
      pinScroll();
      await sleep(16);
    }
    span.textContent = text;
    caret.remove();
  }

  function addTool(name, cmd, status = "run") {
    const d = document.createElement("details");
    d.className = "tool";
    d.open = true;
    d.innerHTML = `<summary>
        <span class="ti">$</span>
        <span class="nm">${esc(name)}</span>
        <span class="ar">${esc(cmd)}</span>
        <span class="st ${status}">${status === "run" ? "running" : "exit 0"}</span>
      </summary>
      <pre></pre>`;
    const body = lastBody || stream;
    body.appendChild(d);
    pinScroll();
    return d;
  }

  function addDiff(file, add, del, rows) {
    const wrap = document.createElement("div");
    wrap.className = "diff";
    wrap.innerHTML = `<div class="diff-head"><span class="f">${esc(file)}</span>
        <span class="add">+${add}</span><span class="del">−${del}</span>
        <span style="margin-left:auto">patch ready</span></div>
      <pre>${rows
        .map((r) => {
          const cls = r[0] === "+" ? "a" : r[0] === "-" ? "d" : "";
          const sign = r[0] === "+" || r[0] === "-" || r[0] === " " ? r[0] : " ";
          const text = r[0] === "+" || r[0] === "-" || r[0] === " " ? r.slice(1) : r;
          return `<span class="ln ${cls}"><span class="g">${esc(sign)}</span>${esc(text)}</span>`;
        })
        .join("")}</pre>`;
    const body = lastBody || stream;
    body.appendChild(wrap);
    pinScroll();
  }

  async function streamOutput(pre, lines) {
    pre.textContent = "";
    for (const line of lines) {
      if (state.aborted) break;
      pre.textContent += line + "\n";
      pre.scrollTop = pre.scrollHeight;
      pinScroll();
      await sleep(jitter(90, 190));
    }
  }

  function thinking(text) {
    const el = document.createElement("div");
    el.className = "thinking";
    el.innerHTML = `<i></i><i></i><i></i><span>${esc(text)}</span>`;
    const body = lastBody || stream;
    body.appendChild(el);
    pinScroll();
    return el;
  }
  /* ---------------- playback primitives ---------------- */

  async function pause(ms) {
    if (state.aborted) return;
    await sleep(ms);
  }

  async function waitThinking(label, ms = 900) {
    const el = thinking(label);
    await pause(ms);
    el.remove();
  }

  async function runTool(name, cmd, lines, desc, pct) {
    if (state.aborted) return null;
    const t = addTool(name, cmd, "run");
    setNow(name, desc || "exec", cmd, 12, "0.0s");
    logLine("hot", name, cmd);
    await pause(260);
    const pre = t.querySelector("pre");
    pre.textContent = "";
    let i = 0;
    for (const line of lines) {
      if (state.aborted) break;
      pre.textContent += line + "\n";
      pre.scrollTop = pre.scrollHeight;
      pinScroll();
      i++;
      setNow(name, desc || "exec", cmd, 12 + (i / lines.length) * 84, (i * 0.11).toFixed(1) + "s");
      await sleep(jitter(70, 165));
    }
    const st = t.querySelector(".st");
    st.className = "st ok";
    st.textContent = "exit 0";
    tickTools();
    bumpContext();
    logLine("ok", name, (desc || "exec") + " · exit 0");
    return t;
  }

  /* ---------------- seed run ---------------- */

  const NMAP = [
    "Starting Nmap 7.95 ( https://nmap.org )",
    "Nmap scan report for staging.acme-core.io (10.0.4.12)",
    "PORT     STATE SERVICE    VERSION",
    "22/tcp   open  ssh        OpenSSH 9.6 (Ubuntu)",
    "443/tcp  open  ssl/http   nginx 1.24.0",
    "5432/tcp open  postgresql PostgreSQL 15.4",
    "8080/tcp open  http       Node.js Express (Next.js 14.1)",
    "Service detection performed. 9 services, 4 hosts up.",
  ];

  const GREP = [
    "src/api/v2/user.ts:42   const org = req.headers['x-org-id'] ?? user.orgId;",
    "src/api/v2/user.ts:43   const row = await db.user.findById(id, { org });",
    "src/auth/session.ts:88  if (!claims.org) return next();",
    "",
    "3 matches · 2 files · trust boundary crossed at header read",
  ];

  const CURL = [
    "$ curl -s -H 'authorization: Bearer <user>' -H 'x-org-id: org_9f3' \\",
    "      https://staging.acme-core.io/api/v2/user?id=1",
    "",
    "HTTP/2 200",
    "content-type: application/json",
    "",
    '{"id":1,"email":"root@acme-core.io","role":"owner",',
    ' "org":"org_9f3","mfa":false,"impersonation":"disabled"}',
    "",
    "→ cross-tenant read confirmed · owner record exposed",
  ];

  async function playSeed() {
    setRunning(true);

    const u = addMsg("user");
    u.innerHTML =
      "<p>Recon <code>acme-core</code> staging. I want the auth bypass you flagged last week, then chain to RCE if the path is clean. Report + patches.</p>";

    logLine("hot", "run.start", "profile deep · budget 200k");
    setNow("planner", "scoping", "resolve scope.yaml · 4 hosts", 8, "0.2s");
    await waitThinking("planning · 4 hosts, 2 authenticated", 1100);

    const a1 = addMsg("agent");
    await type(
      a1,
      "Scope parsed: 10.0.4.0/24, staging only, no destructive writes. Plan is recon → header trust review → idor proof → patch. Starting with a service sweep."
    );
    setNow("planner", "recon", "nmap 10.0.4.0/24", 24, "0.6s");
    await pause(500);
    advanceTodo();

    await runTool(
      "tool.bash",
      "nmap -sV -T4 10.0.4.0/24 -oX recon/nmap.xml",
      NMAP,
      "service sweep",
      0
    );
    setNow("tool.grep", "header trust review", "grep -rn \"x-org-id\" src/", 52, "1.4s");
    await pause(420);
    advanceTodo();

    await runTool(
      "tool.grep",
      "grep -rn \"x-org-id\" src/ --include=*.ts",
      GREP,
      "header trust review",
      0
    );

    const a2 = addMsg("agent");
    await type(
      a2,
      "Found it. /api/v2/user reads x-org-id straight from the request header and passes it into the query as a tenant filter, with no check that the caller's session belongs to that org. session.ts bails early when claims.org is missing, so the request never reaches the guard."
    );

    await runTool(
      "tool.bash",
      "curl -s -H 'x-org-id: org_9f3' /api/v2/user?id=1",
      CURL,
      "idor proof · cross-tenant read",
      0
    );
    advanceTodo();
    logLine("hot", "finding", "cross-tenant idor · severity critical");

    const a3 = addMsg("agent");
    await type(
      a3,
      "Proof is clean: user token + foreign org header returns the owner record. That is a full tenant escape. Patch below takes the header out of the trust path and derives org from the session claims only."
    );
    addDiff("src/api/v2/user.ts", 12, 3, [
      "   export async function getUser(req: Request) {",
      "-  const org = req.headers['x-org-id'] ?? user.orgId;",
      "-  const row = await db.user.findById(id, { org });",
      "+  const claims = await requireSession(req);",
      "+  if (!claims.org) throw forbidden('no org in session');",
      "+  const row = await db.user.findById(id, { org: claims.org });",
      "+  if (row.org !== claims.org) throw forbidden('cross-tenant');",
      "   return row;",
      " }",
    ]);

    await runTool(
      "tool.bash",
      "pnpm test --filter api/v2 -- --runInBand",
      [
        "PASS  api/v2/user.test.ts",
        "  ✓ rejects missing org claim            (12 ms)",
        "  ✓ rejects foreign x-org-id header      (9 ms)",
        "  ✓ scopes query to session org          (7 ms)",
        "",
        "Tests: 3 passed, 3 total · 28ms",
      ],
      "patch verification",
      0
    );

    const a4 = addMsg("agent");
    a4.innerHTML =
      "<p><strong>Impact:</strong> any authenticated user could read or modify records in any tenant, including owner accounts. Chained with the impersonation flag that is a straight path to admin, and from there to the shell on 8080.</p>" +
      "<p>Report written to <code>reports/acme-core.md</code> with the request/response pair, the patch and a revert path. Two more endpoints read the same header — queued next.</p>";
    pinScroll();

    setNow("tool.report", "writing report", "reports/acme-core.md", 100, "8.9s");
    logLine("ok", "report", "reports/acme-core.md · critical, 2 high");
    advanceTodo();
    await pause(700);

    state.step = 4;
    setNow("subagent", "exploit-chain", "build impersonation payload", 46, "9.4s");
    setRunning(true);
    ambient();
  }

  /* ---------------- ambient activity ---------------- */

  let ambientTimer = 0;
  const AMBIENT = [
    ["tool.browser", "verify token scope → admin", "browser probe", "GET /api/v2/admin/keys"],
    ["tool.bash", "ffuf -w raft-small -u /api/FUZZ", "surface fuzz", "ffuf raft-small"],
    ["tool.grep", "prototype pollution sinks", "sink review", "grep --assign"],
    ["subagent", "recon-web", "crawl JS bundles", "js deps + secrets"],
    ["tool.browser", "replay request without mfa", "mfa bypass check", "POST /api/v2/session"],
  ];

  function ambient() {
    clearInterval(ambientTimer);
    let i = 0;
    ambientTimer = setInterval(() => {
      if (!state.running || state.aborted) return;
      const [tool, arg, desc, cmd] = AMBIENT[i % AMBIENT.length];
      i++;
      state.step++;
      setNow(tool, desc, cmd, 10 + Math.random() * 80, (8 + i).toFixed(1) + "s");
      if (i % 2 === 0) {
        tickTools();
        logLine("hot", tool, arg);
      }
      const bars = document.querySelectorAll(".agent-row .bar i");
      bars.forEach((b) => {
        const v = Math.min(98, parseFloat(b.style.width) + Math.random() * 6);
        b.style.width = v + "%";
        b.parentElement.parentElement.querySelector(".pc").textContent = Math.round(v) + "%";
      });
      state.speed = jitter(8.2, 12.6);
      $("#speedVal").textContent = state.speed.toFixed(1) + "×";
      document.querySelector("#stream").scrollTop = document.querySelector("#stream").scrollHeight;
    }, 3200);
  }

  /* ---------------- replies ---------------- */

  function reportBlock() {
    const a = addMsg("agent");
    a.innerHTML =
      "<p>Report assembled. Three findings, one critical, patches attached, revert path included.</p>";
    const t = addTool("tool.report", "reports/acme-core.md", "run");
    t.querySelector("pre").textContent = [
      "# acme-core — security report",
      "",
      "CRITICAL  idor  /api/v2/user        cross-tenant read + write",
      "HIGH      auth  /api/v2/admin/keys  header-trusted org scope",
      "HIGH      mfa   /api/v2/session     bypass via impersonation flag",
      "",
      "evidence   2 request/response pairs · 1 diff · 3 tests",
      "budget     138k / 200k tokens · 41.2s wall",
      "",
      "verdict    tenant escape confirmed, chain to admin verified",
    ].join("\n");
    t.querySelector(".st").className = "st ok";
    t.querySelector(".st").textContent = "ready";
    tickTools();
    logLine("ok", "report", "exported · 3 findings");
    pinScroll();
  }

  async function reply(text) {
    const t = text.toLowerCase();
    if (/report|export|summary/.test(t)) {
      setRunning(true);
      setNow("tool.report", "assembling", "reports/acme-core.md", 30, "0.1s");
      await pause(700);
      reportBlock();
      setRunning(false);
      return;
    }
    if (/sql|inject|sqli/.test(t)) {
      setRunning(true);
      const a = addMsg("agent");
      await type(a, "Running a parameterised probe against the id sink, then a time-based fallback if the first is clean.");
      await runTool(
        "tool.bash",
        "sqlmap -u 'https://staging.acme-core.io/api/v2/user?id=1' --batch --level=2",
        [
          "[INFO] testing connection to the target URL",
          "[INFO] heuristic test shows the GET parameter 'id' might be injectable",
          "[INFO] testing 'AND boolean-based blind'",
          "[CRITICAL] all tested parameters appear to be injectable",
          "back-end DBMS: PostgreSQL 15.4",
          "→ parameterised query confirmed absent · sink is concatenated",
        ],
        "sqli probe",
        0
      );
      await type(a, "Injection confirmed on id. The patch in src/api/v2/user.ts already routes through the query builder — applying it here closes both this and the idor.");
      setRunning(false);
      return;
    }
    setRunning(true);
    const a = addMsg("agent");
    await waitThinking("reading workspace · 3 files in context", 700);
    await type(a, "On it. Checking the same trust path in api/v2/admin and mapping what the owner token can reach once org scope is bypassed.");
    await runTool(
      "tool.browser",
      "GET /api/v2/admin/keys with org_9f3",
      [
        "HTTP/2 200",
        '{"keys":[{"id":"k_live_4f2","scope":"write"},',
        ' {"id":"k_live_91a","scope":"admin"}]}',
        "",
        "→ admin key material exposed to tenant-scoped token",
      ],
      "admin surface",
      0
    );
    await type(a, "Second instance confirmed: /api/v2/admin/keys leaks live admin keys to any tenant token. Queued the patch and added it to the report.");
    setRunning(true);
    ambient();
  }

  /* ---------------- wiring ---------------- */

  function send() {
    const text = input.value.trim();
    if (!text) return;
    const u = addMsg("user");
    u.textContent = text;
    input.value = "";
    input.style.height = "auto";
    state.aborted = false;
    bumpContext();
    logLine("hot", "prompt", text.slice(0, 60));
    reply(text);
    pinScroll();
  }

  sendBtn.addEventListener("click", send);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(180, input.scrollHeight) + "px";
  });

  document.querySelectorAll(".pchip[data-profile]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".pchip[data-profile]").forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      logLine("hot", "profile", chip.dataset.profile + " selected");
    });
  });

  $("#stopBtn").addEventListener("click", () => {
    state.aborted = true;
    state.running = false;
    setRunning(false);
    logLine("hot", "run.abort", "killed by operator");
    setNow("—", "aborted", "no tool running", 0, "—");
  });

  $("#exportBtn").addEventListener("click", () => {
    reportBlock();
    logLine("ok", "export", "reports/acme-core.md");
  });

  const MODELS = ["tiki-v3 · flash", "tiki-v3 · deep", "tiki-v3 · local"];
  let mi = 0;
  $("#modelChip").addEventListener("click", () => {
    mi = (mi + 1) % MODELS.length;
    $("#modelChip").querySelector("b").textContent = MODELS[mi];
    logLine("hot", "model", MODELS[mi]);
  });

  $("#railBtn").addEventListener("click", () => $("#rail").classList.toggle("open"));
  $("#actBtn").addEventListener("click", () => $("#activity").classList.toggle("open"));

  if (runner && !reduce) {
    setInterval(() => {
      if (state.running) runner.setActivity(jitter(0.7, 1));
      else runner.setActivity(0.12);
    }, 1800);
  }

  setInterval(() => {
    const s = Math.floor((Date.now() - state.started) / 1000);
    $("#elapsed").textContent =
      String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 1000);

  setInterval(() => {
    $("#mTok").textContent = state.running ? String(Math.round(jitter(48, 132))) : "0";
  }, 1400);

  /* ---------------- palette ---------------- */

  const COMMANDS = [
    { label: "new session", hint: "⌘N", run: () => { stream.innerHTML = ""; state.aborted = false; logLine("hot", "session", "tk-8843 created"); playSeed(); } },
    { label: "run report", hint: "⌘E", run: reportBlock },
    { label: "toggle activity rail", hint: "⌘A", run: () => $("#activity").classList.toggle("open") },
    { label: "toggle workspace", hint: "⌘B", run: () => $("#rail").classList.toggle("open") },
    { label: "switch model", hint: "⌘M", run: () => $("#modelChip").click() },
    { label: "stop current run", hint: "esc", run: () => $("#stopBtn").click() },
    { label: "open landing", hint: "↗", run: () => (location.href = "index.html") },
    { label: "copy session id", hint: "⌘C", run: () => navigator.clipboard && navigator.clipboard.writeText("tk-8842") },
  ];

  const palette = $("#palette");
  const palInput = $("#palInput");
  const palList = $("#palList");
  const palEmpty = $("#palEmpty");
  let palSel = 0;

  function renderPalette() {
    const q = palInput.value.toLowerCase().trim();
    const items = COMMANDS.filter((c) => c.label.includes(q));
    palSel = Math.min(palSel, Math.max(0, items.length - 1));
    palList.innerHTML = items
      .map(
        (c, i) =>
          `<li class="${i === palSel ? "sel" : ""}" data-i="${i}"><span>${esc(c.label)}</span><span class="k">${c.hint}</span></li>`
      )
      .join("");
    palEmpty.hidden = items.length > 0;
    palList._items = items;
  }

  function openPalette() {
    palette.hidden = false;
    palInput.value = "";
    palSel = 0;
    renderPalette();
    palInput.focus();
  }
  function closePalette() {
    palette.hidden = true;
    input.focus();
  }

  palInput.addEventListener("input", renderPalette);
  palInput.addEventListener("keydown", (e) => {
    const items = palList._items || [];
    if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(items.length - 1, palSel + 1); renderPalette(); }
    if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalette(); }
    if (e.key === "Enter" && items[palSel]) { closePalette(); items[palSel].run(); }
    if (e.key === "Escape") closePalette();
  });
  palList.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const items = palList._items || [];
    const cmd = items[Number(li.dataset.i)];
    if (cmd) { closePalette(); cmd.run(); }
  });
  palette.addEventListener("click", (e) => { if (e.target === palette) closePalette(); });

  addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); palette.hidden ? openPalette() : closePalette(); return; }
    if (e.key === "Escape" && !palette.hidden) { closePalette(); return; }
    if (e.key === "/" && document.activeElement !== input && palette.hidden) {
      e.preventDefault();
      input.focus();
    }
  });

  todoProgress();
  playSeed();

};
