# tiki agent

A web-native security agent with an IDE-style console and a live agent activity rail.
Black and red, monospace, zero build step. The mascot is a chili with a lightning bolt
that runs fast enough to leave afterimages.

Two versions ship here:

| version | entry | shape |
| --- | --- | --- |
| v1 | `index.html` + `app.html` | split: separate HTML, CSS, JS and SVG assets |
| v2 | `v2/index.html` | one file: every style, script and asset inlined, landing and console routed by hash |

v2 is generated from v1 with `tools/build-v2.py`, so edit the split sources and rebuild.

```
python3 -m http.server 8080
# v1 landing   http://127.0.0.1:8080/templates/tiki-agent/index.html
# v1 console   http://127.0.0.1:8080/templates/tiki-agent/app.html
# v2 (either)  http://127.0.0.1:8080/templates/tiki-agent/v2/index.html
# v2 console   http://127.0.0.1:8080/templates/tiki-agent/v2/index.html#/console
```

A static server is required in v1, since assets load by path. v2 also opens straight from
disk: it has no external file except the Google Fonts stylesheet.

---

## What is in the box

```
index.html                 landing: hero, engine grid, live activity preview, pipeline, CTA
app.html                   console: sessions, workspace tree, thread, live agent activity, palette
v2/index.html              single-file build of both pages
assets/css/tiki.css        design tokens, buttons, nav, footer, shared primitives
assets/css/landing.css     landing layout and hero
assets/css/app.css         console layout, chat, tool blocks, activity rail
assets/js/ascii.js         WebGL2 ASCII engine (scene pass -> glyph pass)
assets/js/chili.js         procedural chili runner (raymarched SDF, no meshes)
assets/js/landing.js       hero boot, terminal typing, ticker, lab feed
assets/js/app.js           console runtime, exposed as window.TikiConsole
assets/svg/tiki-mark.svg   logotype mark
assets/svg/tiki-mascot.svg full mascot illustration (also the no-WebGL fallback)
assets/svg/favicon.svg     favicon
assets/svg/og.svg          social card
```

## The chili

`chili.js` is a signed distance field, not a model file. The body is a swept, ribbed
profile along a bent spine; the stem, leaf, legs and shoes are capsules and an ellipsoid.
The whole character is raymarched once per screen cell, then the ASCII pass turns each
cell's brightness into a glyph from tiki's own ramp.

The run is four temporal copies of the character, offset backwards along the motion axis
with decreasing brightness — that is the afterimage. Speed also drives the leg cycle, the
bob, the lean and the wind streak density.

Tuning knobs live in `renderScene`:

| uniform | effect |
| --- | --- |
| `sc` | character scale (0.58 hero, 0.52 compact) |
| `lean` | forward lean, radians |
| ghost loop `g` | number of afterimages and their fade |
| `uAct` | activity 0..1: raises leg speed, bob, streaks |
| `uStyle` | 0 = hero framing, 1 = compact rail framing |

The engine renders the scene at one texel per character cell, then expands it through a
glyph atlas generated at runtime from the ramped character set. Nothing is downloaded, so
the whole identity — glyphs, mark, favicon, mascot — is tiki's own.

If WebGL2 is unavailable the engine swaps in the SVG mascot with CSS afterimage layers and
the console keeps working.

## The console

`app.html` is a working demo thread, not a screenshot. On load it plays a run:

1. scope parse, recon (`nmap`), header trust review (`grep`)
2. idor proof (`curl`) with the raw response
3. patch block with a real diff shape
4. verification run, report write, then ambient activity

The composer is live: type a message and tiki answers with the matching script
(`report`, `sql`, `recon`, or a default admin-surface probe). The right rail tracks the
current step, token rate, tool count, context, the plan checklist, subagents and an event
log. The mascot in the rail speeds up while the agent is running and idles when you hit
`stop`.

Keybinds: `⏎` send, `⇧⏎` newline, `/` focus composer, `⌘K`/`Ctrl+K` command palette,
`esc` close palette.

## Wiring a real backend

`app.js` is the seam. Replace `reply()` and `runTool()` with a transport — SSE, WebSocket
or `fetch` streaming — and drive the same DOM:

- `addMsg("agent")` returns the body element to stream tokens into
- `addTool(name, cmd, state)` returns a `<details>` whose `<pre>` takes live output
- `setNow(tool, desc, cmd, pct, elapsed)` updates the activity rail
- `logLine(kind, key, value)` appends to the event log
- `advanceTodo()` moves the plan forward
- `setRunning(bool)` gates the mascot's activity and the agent pill

The demo simulates all of it with timers so the page is useful with no server running.

## Browser support

WebGL2 for the ASCII runner (Chrome, Edge, Firefox, Safari 15+). Everything else is plain
DOM and CSS. `prefers-reduced-motion` freezes the runner, the typing and the ticker into
static states.
