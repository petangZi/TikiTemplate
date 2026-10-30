#!/usr/bin/env python3
"""Build the single-file v2 of a template from its split sources."""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read(p):
    return (ROOT / p).read_text(encoding="utf-8")


def svg_symbol(name, path):
    raw = read(path)
    vb = re.search(r'viewBox="([^"]+)"', raw).group(1)
    inner = raw[raw.index(">", raw.index("<svg")) + 1: raw.rindex("</svg>")]
    inner = re.sub(r"<\?xml[^>]*\?>", "", inner).strip()
    return f'<symbol id="{name}" viewBox="{vb}">{inner}</symbol>'


def body_of(html):
    m = re.search(r"<body[^>]*>(.*)</body>", html, re.S)
    body = m.group(1)
    body = re.sub(r"<script\b[^>]*>.*?</script>", "", body, flags=re.S)
    return body.strip()


def swap_links(html):
    html = html.replace('href="app.html"', 'href="#/console"')
    html = html.replace('href="index.html"', 'href="#/"')
    html = html.replace('location.href = "index.html"', 'location.href = "#/"')
    return html


def swap_images(html):
    def repl(m):
        tag = m.group(0)
        src = re.search(r'src="([^"]+)"', tag).group(1)
        name = pathlib.Path(src).stem
        cls = re.search(r'class="([^"]*)"', tag)
        cls = cls.group(1) if cls else ""
        if name == "tiki-mascot":
            cls = (cls + " art").strip()
        aria = 'aria-hidden="true"'
        c = f' class="{cls}"' if cls else ""
        return f'<svg{c} {aria}><use href="#{name}"/></svg>'

    return re.sub(r"<img\b[^>]*>", repl, html)


def main(src="tiki-agent", out_dir=None):
    rel = "templates/" + src
    base = ROOT / rel
    src_dir = base
    landing = body_of((src_dir / "index.html").read_text(encoding="utf-8"))
    console = body_of((src_dir / "app.html").read_text(encoding="utf-8"))

    landing = swap_images(swap_links(landing))
    console = swap_images(swap_links(console))

    css = "\n".join(
        read(rel + "/" + p)
        for p in ("assets/css/tiki.css", "assets/css/landing.css", "assets/css/app.css")
    )

    override = """
/* ---- inline build: view router + svg assets ---- */
.view[hidden] { display: none; }
body.on-console { overflow: hidden; height: 100dvh; }
#view-landing { min-height: 100dvh; background: var(--bg); }
.brand svg.mark { width: 26px; height: 26px; }
.topbar .brand svg.mark { width: 22px; height: 22px; }
.hero-fallback svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.cta svg.art { width: clamp(200px, 24vw, 320px); height: auto; filter: drop-shadow(0 30px 60px rgba(255, 47, 47, 0.35)); }
.mini-fallback svg, svg.mini-fallback { width: 100%; height: 100%; }
@media (max-width: 900px) { .cta svg.art { display: none; } }
"""

    symbols = "\n".join(
        [
            svg_symbol("tiki-mark", rel + "/assets/svg/tiki-mark.svg"),
            svg_symbol("tiki-mascot", rel + "/assets/svg/tiki-mascot.svg"),
        ]
    )

    fav = base64.b64encode((src_dir / "assets/svg/favicon.svg").read_bytes()).decode()
    favicon = f"data:image/svg+xml;base64,{fav}"

    js_files = ("assets/js/ascii.js", "assets/js/chili.js", "assets/js/landing.js", "assets/js/app.js")
    js = "\n".join(read(rel + "/" + p) for p in js_files)

    router = """
(() => {
  const landingView = document.getElementById("view-landing");
  const consoleView = document.getElementById("view-app");
  let booted = false;
  function route() {
    const onConsole = location.hash.replace(/^#\\/?/, "") === "console";
    landingView.hidden = onConsole;
    consoleView.hidden = !onConsole;
    document.body.classList.toggle("on-console", onConsole);
    if (onConsole && !booted) {
      booted = true;
      if (window.TikiConsole) window.TikiConsole();
    }
    if (!onConsole) window.scrollTo(0, 0);
  }
  addEventListener("hashchange", route);
  route();
})();
"""

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>tiki agent — security at the speed of flash</title>
<meta name="description" content="tiki is a web-native security agent for pentest and code review. Landing page and console in one file." />
<meta name="theme-color" content="#060607" />
<link rel="icon" href="{favicon}" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
{css}
{override}
</style>
</head>
<body>

<svg width="0" height="0" style="position:absolute" aria-hidden="true">
{symbols}
</svg>

<div class="landing view" id="view-landing">
{landing}
</div>

<div class="app view" id="view-app" hidden>
{console}
</div>

<script>
{js}
</script>
<script>
{router}
</script>
</body>
</html>
"""

    out = pathlib.Path(out_dir) if out_dir else (base / "v2")
    out.mkdir(parents=True, exist_ok=True)
    dest = out / "index.html"
    dest.write_text(doc, encoding="utf-8")
    print(f"wrote {dest} ({len(doc) / 1024:.0f} KB)")


if __name__ == "__main__":
    main(*sys.argv[1:])
