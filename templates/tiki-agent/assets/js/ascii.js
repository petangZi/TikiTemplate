/* ============================================================
   tiki ascii engine — WebGL2
   scene pass (1 texel per char cell) -> glyph pass (atlas)
   glyph atlas is generated at runtime from tiki's own ramp.
   usage:
     TikiAscii(canvas, { scene: GLSL string defining
       vec4 renderScene(vec2 uv, vec2 res), cell: 11 })
   ============================================================ */
(() => {
  const TIKI_RAMP = " .·:-=+*xoX#%&@";

  const VERT = `#version 300 es
  in vec2 p;
  void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const COMMON = `#version 300 es
  precision highp float;
  uniform vec2  r;      // render resolution (cells)
  uniform vec2  R;      // canvas resolution (px)
  uniform float t;      // seconds
  uniform vec2  m;      // pointer 0..1
  uniform float uAct;   // activity 0..1
  uniform float uStyle; // 0 = hero, 1 = compact
  uniform sampler2D prev;
  out vec4 o;
  %SCENE%
  void main(){
    vec2 uv = gl_FragCoord.xy / r;
    o = renderScene(uv, r);
  }`;

  const GLYPH = `#version 300 es
  precision highp float;
  uniform sampler2D sc;
  uniform sampler2D at;
  uniform vec2  R;
  uniform vec2  G;   // cols, rows
  uniform float NG;
  uniform float CW;
  uniform float CH;
  uniform float t;
  uniform float uStyle;
  out vec4 o;

  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

  void main(){
    vec2 px = vec2(gl_FragCoord.x, R.y - gl_FragCoord.y);
    vec2 cell = floor(px / vec2(CW, CH));
    vec2 f = fract(px / vec2(CW, CH));

    vec4 s = texelFetch(sc, ivec2(int(cell.x), int(G.y - 1.0 - cell.y)), 0);
    float L = clamp(s.a, 0.0, 1.0);

    // a light scatter so the field breathes instead of looking like a still
    float j = h21(cell + floor(t * 7.0));
    float idx = floor(L * (NG - 1.0));
    if (L > 0.02) {
      if (j > 0.994) idx = min(NG - 1.0, idx + 1.0);
      else if (j < 0.006) idx = max(0.0, idx - 1.0);
    }

    float g = texture(at, vec2((idx + clamp(f.x, 0.02, 0.98)) / NG, f.y)).r;
    // faint sub-cell glow so edges are not aliased blocks
    float glyph = clamp(g, 0.0, 1.0);
    vec3 c = s.rgb * glyph;
    // scanline + vignette in the engine so both pages share the look
    float scan = 0.92 + 0.08 * sin(px.y * 1.6);
    c *= scan;
    o = vec4(c, 1.0);
  }`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error("[tiki-ascii] shader:\n" + log + "\n" + src.split("\n").map((l, i) => (i + 1) + "  " + l).join("\n"));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function program(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("[tiki-ascii] link: " + gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function makeAtlas(gl, ramp, cellW, cellH) {
    const n = ramp.length;
    const cv = document.createElement("canvas");
    cv.width = n * cellW;
    cv.height = cellH;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${Math.floor(cellH * 0.92)}px "JetBrains Mono", ui-monospace, monospace`;
    for (let i = 0; i < n; i++) {
      ctx.fillText(ramp[i], i * cellW + cellW / 2, cellH / 2 + cellH * 0.04);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function TikiAscii(canvas, opts = {}) {
    const sceneSrc = opts.scene || "";
    const cell = opts.cell || 11;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      canvas.style.background =
        "radial-gradient(42% 46% at 62% 54%, rgba(255,47,47,.22), rgba(120,10,10,.10) 45%, transparent 72%)";
      canvas.classList.add("ascii-off");
      const host = canvas.closest(".hero, .mini") || document.body;
      if (host) host.classList.add("no-webgl");
      return { ok: false, setActivity() {}, dispose() {} };
    }

    const fsScene = COMMON.replace("%SCENE%", () => sceneSrc);
    const P1 = program(gl, VERT, fsScene);
    const P2 = program(gl, VERT, GLYPH);
    if (!P1 || !P2) return { ok: false, setActivity() {}, dispose() {} };

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const half = !!gl.getExtension("EXT_color_buffer_float");
    let atlas = makeAtlas(gl, TIKI_RAMP, 32, 52);
    const NG = TIKI_RAMP.length;

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (gl.isContextLost()) return;
        const old = atlas;
        atlas = makeAtlas(gl, TIKI_RAMP, 32, 52);
        gl.deleteTexture(old);
      }).catch(() => {});
    }

    let fbo = null, tex = null, cols = 0, rows = 0, cw = 0, ch = 0;

    function alloc() {
      if (tex) gl.deleteTexture(tex);
      if (fbo) gl.deleteFramebuffer(fbo);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, cols, rows, 0, gl.RGBA,
        half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2) * (opts.dpr || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ch = cell * dpr;
      cw = ch * 0.60;
      cols = Math.max(2, Math.ceil(canvas.width / cw));
      rows = Math.max(2, Math.ceil(canvas.height / ch));
      alloc();
      canvas._cw = cw;
      canvas._ch = ch;
    }

    const U1 = (n) => gl.getUniformLocation(P1, n);
    const U2 = (n) => gl.getUniformLocation(P2, n);
    const u = {
      r: U1("r"), R: U1("R"), t: U1("t"), m: U1("m"), act: U1("uAct"), style: U1("uStyle"),
    };
    const v = {
      sc: U2("sc"), at: U2("at"), R: U2("R"), G: U2("G"), NG: U2("NG"),
      CW: U2("CW"), CH: U2("CH"), t: U2("t"), style: U2("uStyle"),
    };

    let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, activity = 0, shownAct = 0;
    const onMove = (e) => {
      const b = canvas.getBoundingClientRect();
      if (!b.width) return;
      tx = (e.clientX - b.left) / b.width;
      ty = 1 - (e.clientY - b.top) / b.height;
    };
    addEventListener("pointermove", onMove, { passive: true });

    let ro;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(resize);
      ro.observe(canvas);
    }
    addEventListener("resize", resize);
    resize();

    const style = opts.compact ? 1 : 0;
    const t0 = performance.now();
    let raf = 0, dead = false;

    function draw(now) {
      if (dead) return;
      raf = requestAnimationFrame(draw);
      if (!cols || !rows || !canvas.clientWidth || !canvas.clientHeight) return;

      const time = still ? 6.0 : (now - t0) / 1000;
      mx += (tx - mx) * 0.06;
      my += (ty - my) * 0.06;
      shownAct += (activity - shownAct) * 0.05;

      // scene -> one texel per cell
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, cols, rows);
      gl.useProgram(P1);
      gl.uniform2f(u.r, cols, rows);
      gl.uniform2f(u.R, canvas.width, canvas.height);
      gl.uniform1f(u.t, time);
      gl.uniform2f(u.m, mx, my);
      gl.uniform1f(u.act, shownAct);
      gl.uniform1f(u.style, style);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // cells -> glyphs
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(P2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(v.sc, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.uniform1i(v.at, 1);
      gl.uniform2f(v.R, canvas.width, canvas.height);
      gl.uniform2f(v.G, cols, rows);
      gl.uniform1f(v.NG, NG);
      gl.uniform1f(v.CW, canvas._cw);
      gl.uniform1f(v.CH, canvas._ch);
      gl.uniform1f(v.t, time);
      gl.uniform1f(v.style, style);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const onContext = (e) => { e.preventDefault(); };
    canvas.addEventListener("webglcontextlost", onContext, false);

    requestAnimationFrame(draw);

    return {
      ok: true,
      setActivity(x) { activity = Math.max(0, Math.min(1, x)); },
      dispose() {
        dead = true;
        cancelAnimationFrame(raf);
        removeEventListener("pointermove", onMove);
        removeEventListener("resize", resize);
        if (ro) ro.disconnect();
        const ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      },
    };
  }

  window.TIKI_RAMP = TIKI_RAMP;
  window.TikiAscii = TikiAscii;
})();
