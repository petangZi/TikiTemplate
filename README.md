# TikiTemplate

Web page templates built around tiki — a chili with a lightning bolt and a shell.
Black and red, monospace, hand-cut assets. No frameworks, no build pipeline, no dependency
lockfile you have to trust.

Every template ships in two shapes:

- **v1** — split sources: HTML, CSS, JS and SVG in separate files. Edit this one.
- **v2** — a single HTML file with every style, script and asset inlined. Ship this one.

v2 is generated from v1, so the two never drift by hand.

## Templates

| template | stack | v1 | v2 |
| --- | --- | --- | --- |
| [tiki agent](templates/tiki-agent) — security agent landing + IDE console with live agent activity | WebGL2, vanilla JS, CSS | [v1](templates/tiki-agent/index.html) · [console](templates/tiki-agent/app.html) | [v2](templates/tiki-agent/v2/index.html) |

Live files are plain HTML: open them through any static server, or drop the v2 file
anywhere and open it directly.

```
git clone https://github.com/petangZi/TikiTemplate.git
cd TikiTemplate
python3 -m http.server 8080
# http://127.0.0.1:8080/templates/tiki-agent/index.html
```

## Layout

```
templates/
  <slug>/
    index.html            main page (v1)
    app.html              secondary page, when the template has one (v1)
    README.md             what it is, how to run, how to wire it up
    assets/
      css/ js/ svg/
    v2/
      index.html          generated single-file build
tools/
  build-v2.py             v1 -> v2 compiler
```

## Adding a template

1. Copy the shape of an existing template into `templates/<slug>/`.
2. Keep the shared palette from `assets/css/tiki.css`: surfaces `#060607` / `#0c0c0f`,
   ink `#f4f1ee`, red `#ff2f2f`, ember `#ff6a34`, line `rgba(255,255,255,.08)`.
3. Keep assets local. No CDN scripts, no external images: any SVG has to be one tiki owns.
4. Build the single file:

```
python3 tools/build-v2.py <slug>
```

The builder inlines the CSS, the JS and the SVG symbols, base64s the favicon and writes
`templates/<slug>/v2/index.html`. It also rewrites links between `index.html` and
`app.html` into hash routes and swaps `<img>` SVG assets for `<use>` references.

The file list is explicit, not guessed: the script reads `assets/css/tiki.css`,
`assets/css/landing.css`, `assets/css/app.css` and the four JS files. A template with a
different shape needs that list updated at the top of the script.

## Conventions

- Monospace UI (JetBrains Mono), display type in Space Grotesk.
- Red is a signal, not a wash: borders, one accent per block, live dots.
- Every page has to survive `prefers-reduced-motion` and a missing WebGL2 context.
- No text baked into an image. SVG carries shape, HTML carries words.
