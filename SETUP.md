# Setup — olabannan-state-migration-replica

## Requirements

- Docker 24 or newer (for `./verify.sh` dev and prod profiles), **or**
- Python 3.10 or newer (for a quick static preview only)
- Node.js 20 or newer (only to run the browser probe; not needed to serve)

No environment variables, accounts, or backend services are required.

## Run locally

```bash
cd olabannan-state-migration-replica
./verify.sh --plan   # dry run: prints what dev and prod will do
./verify.sh          # dev profile: compose build + up, health check
./verify.sh --prod   # production profile: docker build + run, health check
```

Open `http://localhost:8901/`. Both profiles serve the identical vendored
file set through nginx; there is no dev server and no build step.

Quick static preview without Docker:

```bash
python3 -m http.server 8791
# open http://localhost:8791/
```

## Verify

```bash
./verify.sh --plan
./verify.sh            # run twice: clean boots must reach the same state
./verify.sh --prod
```

Then, with either profile up, run a Playwright probe at 1440px and 390px
against `http://localhost:8901/` and require: zero console, page, and
network errors; the status line reaches
`{year} (P…/12) | … | … | … visible corridors`; stats are nonzero; the
ranking lists 10 rows. Confirm zero external requests — D3,
topojson-client, us-atlas geometry, and the Census CSV are all vendored, so
setup and runtime need no live fetch.

## Product assets

No external assets exist at runtime. Vendored in the repo:

- `vendor/d3.min.js`, `vendor/topojson-client.min.js` — the only JS libraries
- `vendor/states-10m.json` — us-atlas nation/state geometry
- `state_to_state_migration_normalized.csv` (~16MB) — Census state-to-state
  migration tables, normalized; year range and slider span derive from it
- favicon is an inline SVG data URI in `index.html` (map-dot motif)

The map, flow rendering, and interaction code (`app.js`, `styles.css`,
`index.html`) were written for this project.

## Deployment

The container serves static files from nginx on port 8901 with health path
`/`. Deployment metadata is maintained in `site.toml`; the operational
contract (single service, start command, port, health) in `app.toml` and
`docker-compose.yml`.

## Walkthrough video

Record a narrated walkthrough covering: full map with animated dot flows and
open panel, year scrub and Play/Pause year cycling with the P1/12–P12/12
pulse, state and direction filters, corridor/density/speed sliders, live
stats and the clickable top-10 ranking with focus dimming, hover detail
lines, pan/zoom with Reset Map View, Minimize/Expand, `?export=1` capture
mode, and the mobile overlay at 390px — then link it here.
