# Build Instructions — olabannan-state-migration-replica

Replicate the US state-to-state migration dot-flow visualization 1:1 on
desktop (1440px) and mobile (390px):

Original: https://willsigal.github.io/state-migration-analysis/migration_flow_3d.html

## What to build

A single static page (`index.html` + `styles.css` + `app.js`, no framework,
no backend) that reproduces the original's full experience:

1. Full-viewport D3 map of the US (us-atlas `states-10m.json` geometry via
   topojson-client) with abbreviation labels, drag-pan, scroll-zoom, and a
   Reset Map View control. Double-click zoom stays disabled.
2. Animated canvas dot-flow arcs between states, volume-weighted (thicker
   bands, denser dots for larger flows), inflow and outflow on separate lanes,
   motion-trail fading, and a 12-period pulse cycling P1/12–P12/12 every
   0.45s.
3. Floating control panel with the exact copy and defaults in PRD.md: year
   scrubber over the data years, Play/Pause year cycling, state and direction
   filters, corridor/density/speed sliders, six live stat cards, clickable
   top-10 corridor ranking with focus dimming, Minimize toggle, and the
   `?export=1` capture mode.
4. The vendored Census CSV (`state_to_state_migration_normalized.csv`) as the
   only dataset; year range and slider span derive from the file, defaulting
   to the latest year and top 180 corridors.

## Constraints

- Own implementation: write the layout, styling, and interaction code
  yourself. Third-party libraries (D3, topojson-client) and public data
  (us-atlas geometry, Census tables) must be vendored under `vendor/` —
  zero external requests at setup or runtime.
- Match the original's behavior, not just its look: status-line pattern,
  badge values, slider ranges and steps, ranking label format, focus dimming
  to 35%, and the mobile overlay treatment at 900px and below.
- Do not invent features the original lacks (no new routes, modals, accounts,
  or motion-preference switches). Scope cuts must remove cleanly with no dead
  controls left behind.
- WebCraft 2.0 contract is part of done: `site.toml` with
  `category = "webcraft-2.0"`, single-service `docker-compose.yml`, `app.toml`
  with start command, port 8901, and health `/`, node-server front door on
  0.0.0.0, and `verify.sh` with `--plan`, dev, and `--prod` profiles.

## Verify before calling it done

- `node`-driven browser probe at 1440px and 390px: zero console, page, and
  network errors; status line reaches the live pattern; stats nonzero.
- Screenshot-compare desktop and mobile against the original side by side.
- `./verify.sh --plan`, `./verify.sh` twice, `./verify.sh --prod` — all pass
  health at `http://localhost:8901/`.
- `PRD.md` describes the shipped product exactly (copy, states, responsive
  behavior, acceptance criteria) and `features.json` holds the five rubrics
  the walkthrough demonstrates.
