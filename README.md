# olabannan-state-migration-replica — US Migration Dot Flows

1:1 interactive replica of the state-to-state migration dot-flow visualization.

## Run it

```bash
cd olabannan-state-migration-replica
./verify.sh --plan   # dry run
./verify.sh          # dev profile: compose build + up, health check (port 8901)
./verify.sh --prod   # production profile: docker build + run, health check
# open http://localhost:8901/
```

Quick local preview without Docker: `python3 -m http.server 8791`
(open http://localhost:8791/).

## What it does

- US map (D3 + us-atlas geometry) with state labels, hover details, click-to-focus, pan/zoom.
- 180 volume-weighted migration corridors as animated dot arcs on canvas, with
  inflow/outflow split onto separate lanes and motion-trail fading.
- Year scrubber (2005–2024) with 12-period playback, Play/Pause year cycling.
- Filters: state, direction, corridor count, dot density, dot speed.
- Live stats (visible migrants, corridors, inflow, outflow, net, year total) and
  clickable top-10 corridor ranking with focus/hover emphasis.
- Minimizable control panel; `?export=1` (or `?ui=0` / `?panel=0`) hides it.

## Files

- `index.html` — page structure and controls
- `styles.css` — all styling
- `app.js` — map, routes, particles, render loop, UI wiring (own implementation)
- `state_to_state_migration_normalized.csv` — Census-sourced flow dataset (16MB)
- `vendor/` — vendored D3, topojson-client, and us-atlas geometry.
  No CDN, no registry, no network fetch at setup or runtime.
- `site.toml` / `app.toml` / `docker-compose.yml` / `environment/` / `verify.sh` —
  WebCraft 2.0 operational contract (single service, nginx on 0.0.0.0:8901, health `/`).
