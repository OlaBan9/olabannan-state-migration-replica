# US State-to-State Migration — Dot-Flow Visualization

## Product Overview

A single-page interactive data visualization of US state-to-state migration. A
full-viewport D3 map of the United States carries animated canvas dot-flow arcs
between states, and a floating control panel exposes the year scrubber,
playback, filters, live statistics, and a clickable corridor ranking.

The experience is a functional replica of the original migration-flow page: one
route (`/`), no accounts, no backend. All rendering is client-side; the only
data is a vendored Census-sourced CSV plus vendored D3, topojson-client, and
us-atlas geometry. There are no placeholder states — every control is live.

## Audience and Core Journey

The audience is anyone exploring where Americans move: which state pairs
exchange the most migrants, how flows tilt inbound or outbound for a chosen
state, and how the picture changes year to year.

The core journey is short:

1. Land on the full US map with animated dot arcs flowing and the control
   panel open on the left showing the latest year, 180 visible corridors, and
   3.5M visible migrants.
2. Scrub the Year slider or press Play to watch years cycle with pulsing
   sub-year periods.
3. Filter by state and direction, trim the corridor count, or tune dot density
   and speed, and watch the arcs, statistics, and ranking recompute live.
4. Hover a state or corridor for its detail line; click a state boundary or a
   ranking row to focus one corridor while the rest dim; clear the focus to
   restore the full flow field.
5. Pan and zoom the map freely, then reset the view.

## Global Design System

The visual language is a light cartographic theme with a frosted control panel.

| Token | Requirement |
| --- | --- |
| Page / water | `#eef1f4` page, `#e7edf2` water with two soft radial highlights |
| Land / states | `#f4f6f8` nation fill, `#f8f9fa` state fill, `#9fa9b3` boundaries |
| Panel | `#fbfdffeb` frosted surface, `#c7d0d8` border, 11px radius, 13px padding, soft drop shadow |
| Text | `#213142` body, `#5c6f82` dimmed copy, `#35658f` status line |
| Accent | `#2f6ea3` for badges, slider fill, and focus states |
| Net positive / negative | `#2f8c5c` / `#b54b4b` on the Net stat value |
| Legend swatches | `#4f7597` inflow dot, `#9a6d4f` outflow dot |
| State labels | 9px (8px small) semibold `#5f6e7b` with white halo |

| Text role | Typography |
| --- | --- |
| Panel title | Segoe UI stack, ~1.04rem, 700 |
| Control labels | 0.77rem `#4f6276`, label left with pill badge right |
| Stat headings | 0.68rem uppercase `#5f7388`; values 0.93rem 700 |
| Ranking rows | 0.76rem with volume bar behind the text |
| Hint footer | 0.72rem `#5f7388` above a hairline rule |

### Map and flow rendering

- Three stacked layers: base SVG (nation + state fills), canvas (dot arcs,
  pointer-transparent), overlay SVG (boundaries, labels, hover targets).
- Dot arcs are volume-weighted: higher migration renders thicker bands with
  denser dot flow. Inflow and outflow ride separate arc lanes to reduce
  overlap. Dots fade along motion trails.
- Non-focused corridors dim to 35% opacity while a focus is active.

### Branding

- A small inline SVG favicon (map-dot motif) is present in the browser tab.
- No external fonts, images, or trackers; every asset is vendored locally.

### Responsive Layout

The product has two intentional layouts around a single 900px threshold.
Desktop and mobile show the same panel and the same map — nothing is cut on
small screens, the panel simply overlays more of the map:

- **Desktop above 900px** — panel fixed at 14px from the top-left, up to 420px
  wide, full height minus margins, independently scrollable; map fills the
  remaining viewport.
- **Mobile at 900px and below** — panel insets 8px on all sides, up to full
  width minus 16px, capped at viewport height minus 16px; the map renders
  behind it and remains pannable/zoomable around the panel edges.
- Minimized mode collapses the panel to title plus Expand button at any width.
- Constraint: no horizontal page overflow down to 320px; the page itself never
  scrolls (`overflow: hidden`), only the panel interior scrolls.

### Motion

- Period pulse: 12 sub-year periods per year advance every 0.45s, driving a
  sinusoidal dot-density pulse; the period badge (P1/12 … P12/12) follows.
- Corridor band widths ease toward new values on filter/year change instead of
  jumping.
- Map reset animates back to the identity view over 240ms.
- Hover states are instant background/border shifts on buttons and ranking
  rows; no page-level animation.

## Global Content and Data

### Dataset

- `state_to_state_migration_normalized.csv` (~16MB), Census state-to-state
  migration tables normalized to rows of
  `year_start, year_end, …, from_state, to_state, estimate, moe, …`.
- Year range is data-driven (2005–2024 in the current file); the slider spans
  all detected years and defaults to the latest. Status line reports
  `Loaded {rows} usable rows across {years} years` once parsed.

### Panel copy (exact)

- Title: `US State-to-State Migration`; toggle: `Minimize` / `Expand`.
- Sub: `Dot arcs are volume-weighted: higher migration creates thicker bands and denser dot flow.`
- Loading: `Loading map + migration data...`
- Context default: `Hover a state or corridor for detail.`
- Status pattern: `{year} (P{n}/12) | {All states|State} | {IN + OUT|IN|OUT} | {N} visible corridors`
  (e.g. `2024 (P1/12) | All states | IN + OUT | 180 visible corridors`).
- Buttons: `Play` / `Pause`, `Reset Filters`, `Clear Focus`, `Reset Map View`.
- Labels: `Year`, `State`, `Direction`, `Visible Corridors`, `Dot Density`,
  `Dot Speed`.
- Direction options in order: `In + Out`, `Outflow Only`, `Inflow Only`;
  legend: `Inflow`, `Outflow`.
- Slider defaults: corridors 180 (range 30–320, step 10), density 1.6x
  (0.5–2.8, step 0.1), speed 1.0x (0.6–2.2, step 0.1).
- Stat cards in order: `Visible Migrants (Annual)`, `Visible Corridors`,
  `Inflow (Annual)`, `Outflow (Annual)`, `Net (Annual)`, `Total Year Volume (Annual)`.
  Compact notation applies (e.g. `3.5M`, `7.1M`); net carries a sign (`+0`).
- Ranking heading: `Top Visible Corridors (Annual)`. Row pattern:
  `[FLOW|IN|OUT] {from} -> {to}: {value}/yr`
  (e.g. `[FLOW] California -> Texas: 77,161/yr`). Empty state:
  `No corridors visible for this filter.`
- Hint: `Drag to pan, scroll to zoom, click state boundaries to focus. Inflow and outflow are split onto different arc lanes to reduce overlap.`
- State hover detail pattern:
  `{name} | In {in}/yr | Out {out}/yr | Net {±net}/yr`.

## Product Surfaces

### Control Panel

The panel is an `aside` fixed over the map, open by default:

- Title row: heading plus `Minimize` button (`aria-expanded` true). Minimizing
  collapses to title plus `Expand`; the map keeps animating underneath.
- Right after load the panel shows the latest year selected, the period badge
  at P1/12, corridor badge 180, density 1.6x, speed 1.0x, and computed stats.
- Year slider scrubs all data years; Play toggles to Pause and advances one
  year each time the period counter wraps past P12/12, looping back to the
  first year after the last; the slider thumb follows. Pause freezes on the
  current year.
- State dropdown lists all states plus the all-states default; choosing one
  restricts corridors to those touching it and retitles the status line.
- Direction dropdown filters to both flows, outflow only, or inflow only; the
  legend below it always shows both swatches.
- Corridor slider keeps the top N flows by value (30–320). Density and speed
  sliders rescale particle count and velocity live without rebuilding routes.
- Reset Filters restores year to latest, state to all, direction to both,
  corridors to 180, density to 1.6x, speed to 1.0x, and clears focus/hover.
- Stats recompute on every change: visible migrants, visible corridor count,
  inflow, outflow, signed net (green/red tint), and total year volume.
- Ranking lists the top 10 visible corridors with a volume bar scaled to the
  leader. Hovering a row shows its label in the context line and emphasizes
  the corridor on the map; clicking toggles focus on it (row gets the active
  treatment, other corridors dim); clicking again unfocuses.
- `Clear Focus` drops any corridor focus. Empty result sets show the
  no-corridors message in place of rows.

### Map

- US states with postal-abbreviation labels; District of Columbia, Puerto
  Rico, and territories included in geometry; labels stay legible over flow
  via a white halo.
- Hovering a state boundary emphasizes it and shows its in/out/net detail in
  the context line; clicking toggles a state-scoped focus equivalent to the
  ranking click.
- Drag pans (bounded translate extent), wheel/pinch zooms; double-click zoom
  is disabled so rapid corridor clicking never jumps the view.
- `Reset Map View` returns to the fitted nation view with a 240ms ease.
- Geometry comes from the vendored us-atlas `states-10m.json` via
  topojson-client; no tile server, no network.

### URL states

- `?export=1` (aliases `?ui=0`, `?panel=0`) hides the control panel entirely
  for clean capture; the map, flows, and playback state are unaffected.
- No other routes, modals, or overlays exist.

### Loading and error states

- Loading: status line reads `Loading map + migration data...` until both the
  geometry and CSV parse.
- Loaded: status switches to the `Loaded … usable rows …` confirmation, then
  to the live `{year} … visible corridors` pattern.
- If no corridor survives the filters, arcs clear and the ranking shows its
  empty message; stats read zero. Controls never disable.

## Global Accessibility Requirements

- Semantic landmarks: `aside` panel with `h1`, labelled sliders and
  dropdowns, list semantics for the ranking, `aria-expanded` on the
  minimize toggle.
- All controls are native inputs, selects, and buttons — keyboard reachable
  with visible accent focus by default; ranking rows are list items with
  click handlers and hover equivalents on the map itself.
- Canvas flow is decorative motion over an SVG map whose state boundaries are
  the interactive targets; every canvas-only effect (focus dimming, pulses)
  has a panel-side equivalent (active row, badges, stats).
- Touch: panel controls are full-width rows; the map remains pannable around
  the panel on small screens.
- No motion-preference switch exists in the original; none is added.

## Acceptance Criteria

- Page load:
  - No console errors on desktop 1440px and mobile 390px
  - Status reaches the live `{year} (P…/12) | … visible corridors` pattern
  - Default view: latest year, 180 corridors, ranking leader is the
    highest-value pair, stats are nonzero
  - Favicon present in browser tab
  - No horizontal page overflow at any width down to 320px
- Year and playback:
  - Scrubbing the slider changes the year badge, status year, stats, arcs,
    and ranking
  - Play toggles to Pause; years advance on period wrap and loop after last
  - Period badge cycles P1/12 … P12/12 roughly every 0.45s
- Filters:
  - State dropdown restricts corridors and retitles status; direction modes
    map to `IN + OUT` / `OUT` / `IN` in the status line
  - Corridor/density/speed sliders update badges and rendering live
  - Reset Filters restores all six defaults and clears focus
- Focus and map:
  - Hovering a state or ranking row shows its detail in the context line
  - Clicking a state boundary or ranking row focuses it and dims the rest;
    clicking again unfocuses; Clear Focus restores
  - Drag pans, scroll zooms, Reset Map View refits the nation
  - Impossible filter combination shows the empty message with zeroed stats
- Panel and URL:
  - Minimize collapses to title + Expand and expands back
  - `?export=1` (and `?ui=0`, `?panel=0`) hides the panel with map unaffected
- Determinism and isolation:
  - `./verify.sh --plan` dry-runs; `./verify.sh` and `./verify.sh --prod`
    both boot clean and pass health on two consecutive runs
  - Zero external requests at setup or runtime (libraries, geometry, and
    dataset all vendored)
