# Third-party notices — olabannan-state-migration-replica

The map, flow rendering, and interaction code (`index.html`, `styles.css`,
`app.js`) were written for this project. The following third-party inputs are
vendored verbatim under `vendor/` and at the repo root; no CDN, registry, or
network fetch is needed at setup or runtime.

## JavaScript libraries and map geometry (ISC)

- `vendor/d3.min.js` — D3 v7.9.0, copyright 2010–2023 Mike Bostock,
  reused under the ISC License
  (https://github.com/d3/d3/blob/main/LICENSE).
- `vendor/topojson-client.min.js` — topojson-client v3.1.0, copyright
  2012–2019 Michael Bostock, reused under the ISC License
  (https://github.com/topojson/topojson-client/blob/master/LICENSE).
- `vendor/states-10m.json` — us-atlas geometry, copyright 2013–2019 Michael
  Bostock, reused under the ISC License
  (https://github.com/topojson/us-atlas/blob/master/LICENSE).

Each ISC license permits use, copying, modification, and distribution for any
purpose with the copyright notice preserved; the notices above preserve them.

## Dataset (public domain)

- `state_to_state_migration_normalized.csv` — U.S. Census Bureau
  state-to-state migration tables, normalized to
  `year_start, year_end, …, from_state, to_state, estimate, moe, …` rows.
  U.S. federal government work: public domain, no copyright restriction.
