/* US state-to-state migration as animated dot flows.
 *
 * Data: Census state-to-state rows (vendored CSV) grouped by year.
 * View: an SVG land layer, a canvas of particles moving along curved corridor
 * lanes, and an SVG hit layer (boundaries, labels, hover/click targets), all
 * sharing one pan/zoom transform. A console panel drives the filters.
 */
(() => {
  'use strict';

  const DATA_URL = 'state_to_state_migration_normalized.csv';
  const ATLAS_URL = 'vendor/states-10m.json';

  const DEFAULTS = { state: '', direction: 'both', corridors: 180, density: 1.6, speed: 1.0 };
  const PERIODS_PER_YEAR = 12;
  const PERIOD_MS = 450;
  const RANKING_SIZE = 10;
  const DIM_ALPHA = 0.35;
  const HEAD_ALPHA = 0.75;
  const TRAIL_ALPHA = 0.16;
  const HEAD_PX = 5; // bright streak length
  const TRAIL_PX = 34; // faint trail behind it
  // Corridor hues, weighted toward cool greens and teals with a few warm accents.
  const FLOW_PALETTE = [
    '#3f8f77', '#2f8a86', '#4a9a8a', '#358f9c', '#3f86a6', '#4f7fa8', '#46957f',
    '#6f9a3f', '#5e8a3c', '#7fa04a', '#3e4f86', '#5b4a8e', '#b0607a',
  ];
  const RESET_VIEW_MS = 240;
  const LOADED_NOTICE_MS = 1400;

  const DIRECTION_TAG = { both: 'IN + OUT', out: 'OUT', in: 'IN' };
  const INFLOW_COLOR = '#4f7597';
  const OUTFLOW_COLOR = '#9a6d4f';

  const POSTAL = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
    Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA',
    Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY',
    Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
    Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
    'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
    Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA',
    Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'Puerto Rico': 'PR',
  };
  const SMALL_LABELS = new Set(['CT', 'DE', 'DC', 'MA', 'MD', 'NH', 'NJ', 'RI', 'VT']);

  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const signedCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1, signDisplay: 'always' });
  const whole = new Intl.NumberFormat('en-US');

  const $ = (id) => document.getElementById(id);
  const ui = {
    stage: $('stage'), land: d3.select('#land-layer'), hit: d3.select('#hit-layer'), canvas: $('flow-layer'),
    console: $('console'), collapse: $('collapse-btn'), status: $('status-line'), detail: $('detail-line'),
    year: $('year-input'), yearChip: $('year-chip'), periodChip: $('period-chip'),
    play: $('play-btn'), resetFilters: $('reset-filters-btn'), clearFocus: $('clear-focus-btn'), resetView: $('reset-view-btn'),
    state: $('state-input'), direction: $('direction-input'),
    corridors: $('corridor-input'), corridorChip: $('corridor-chip'),
    density: $('density-input'), densityChip: $('density-chip'),
    speed: $('speed-input'), speedChip: $('speed-chip'),
    tiles: $('stat-tiles'), leaders: $('leader-list'),
  };
  const ctx = ui.canvas.getContext('2d');

  const model = {
    years: [], byYear: new Map(), yearIndex: 0, period: 0, playing: false,
    ...DEFAULTS,
    focusKey: null, // corridor key picked from the ranking
    hoverKey: null,
    visible: [], ready: false, live: false,
  };

  const geo = { features: [], centroids: new Map(), projection: null, path: null, transform: d3.zoomIdentity };
  const lanes = new Map(); // corridor key -> lane geometry + particles
  let zoom;

  // ---------------------------------------------------------------- data

  function groupRows(rows, knownStates) {
    let usable = 0;
    for (const row of rows) {
      const year = +row.year_start;
      const value = +row.estimate;
      const from = row.from_state;
      const to = row.to_state;
      if (!year || !(value > 0) || from === to || !knownStates.has(from) || !knownStates.has(to)) continue;
      usable += 1;
      if (!model.byYear.has(year)) model.byYear.set(year, { flows: [], total: 0 });
      const bucket = model.byYear.get(year);
      bucket.flows.push({ from, to, value, key: `${from}>${to}` });
      bucket.total += value;
    }
    for (const bucket of model.byYear.values()) bucket.flows.sort((a, b) => b.value - a.value);
    model.years = [...model.byYear.keys()].sort((a, b) => a - b);
    return usable;
  }

  function currentYear() {
    return model.years[model.yearIndex];
  }

  // Corridors visible under the current filters, strongest first.
  function selectCorridors() {
    const bucket = model.byYear.get(currentYear());
    if (!bucket) return [];
    let pool = bucket.flows;
    if (model.state) {
      pool = pool.filter((flow) => {
        const inbound = flow.to === model.state;
        const outbound = flow.from === model.state;
        if (model.direction === 'in') return inbound;
        if (model.direction === 'out') return outbound;
        return inbound || outbound;
      });
    }
    return pool.slice(0, model.corridors).map((flow) => ({
      ...flow,
      kind: !model.state ? 'FLOW' : flow.to === model.state ? 'IN' : 'OUT',
    }));
  }

  function summarize(corridors) {
    const visible = d3.sum(corridors, (c) => c.value);
    const inflow = model.state ? d3.sum(corridors, (c) => (c.kind === 'IN' ? c.value : 0)) : visible;
    const outflow = model.state ? d3.sum(corridors, (c) => (c.kind === 'OUT' ? c.value : 0)) : visible;
    const total = model.byYear.get(currentYear())?.total ?? 0;
    return { visible, count: corridors.length, inflow, outflow, net: inflow - outflow, total };
  }

  function stateTotals(name) {
    const bucket = model.byYear.get(currentYear());
    let inflow = 0;
    let outflow = 0;
    for (const flow of bucket?.flows ?? []) {
      if (flow.to === name) inflow += flow.value;
      if (flow.from === name) outflow += flow.value;
    }
    return { inflow, outflow, net: inflow - outflow };
  }

  // ---------------------------------------------------------------- map

  function buildMap(atlas) {
    geo.features = topojson.feature(atlas, atlas.objects.states).features;
    geo.nation = atlas.objects.nation
      ? topojson.feature(atlas, atlas.objects.nation)
      : topojson.merge(atlas, atlas.objects.states.geometries);

    ui.land.append('g').attr('class', 'land-view');
    ui.hit.append('g').attr('class', 'hit-view');

    zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        geo.transform = event.transform;
        ui.land.select('.land-view').attr('transform', event.transform);
        ui.hit.select('.hit-view').attr('transform', event.transform);
      });
    ui.hit.call(zoom).on('dblclick.zoom', null);
    layoutMap();
  }

  function layoutMap() {
    const { width, height } = ui.stage.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    ui.canvas.width = Math.round(width * ratio);
    ui.canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    geo.projection = d3.geoAlbersUsa().fitExtent([[0, height * 0.031], [width, height * 0.966]], geo.nation);
    geo.path = d3.geoPath(geo.projection);
    geo.centroids.clear();
    for (const feature of geo.features) {
      const point = geo.path.centroid(feature);
      if (Number.isFinite(point[0])) geo.centroids.set(feature.properties.name, point);
    }
    zoom.translateExtent([[-width * 0.5, -height * 0.5], [width * 1.5, height * 1.5]]);

    const landView = ui.land.select('.land-view');
    landView.selectAll('*').remove();
    landView.append('path').attr('class', 'nation').attr('d', geo.path(geo.nation));
    landView.selectAll('.state-fill').data(geo.features).join('path').attr('class', 'state-fill').attr('d', geo.path);

    const hitView = ui.hit.select('.hit-view');
    hitView.selectAll('*').remove();
    hitView.selectAll('.state-edge')
      .data(geo.features)
      .join('path')
      .attr('class', 'state-edge')
      .attr('d', geo.path);
    // Only the borders are interactive: a wide invisible stroke along each one.
    hitView.selectAll('.state-hit')
      .data(geo.features)
      .join('path')
      .attr('class', 'state-hit')
      .attr('d', geo.path)
      .on('pointerenter', (_, feature) => hoverState(feature.properties.name))
      .on('pointerleave', () => hoverState(null))
      .on('click', (_, feature) => toggleStateFilter(feature.properties.name));
    hitView.selectAll('.state-tag')
      .data(geo.features.filter((f) => geo.centroids.has(f.properties.name) && POSTAL[f.properties.name]))
      .join('text')
      .attr('class', (f) => `state-tag${SMALL_LABELS.has(POSTAL[f.properties.name]) ? ' state-tag--small' : ''}`)
      .attr('x', (f) => geo.centroids.get(f.properties.name)[0])
      .attr('y', (f) => geo.centroids.get(f.properties.name)[1])
      .text((f) => POSTAL[f.properties.name]);

    lanes.clear();
    syncLanes();
  }

  // ---------------------------------------------------------------- corridor lanes and particles

  // Each corridor bends to the left of its travel direction, so A->B and B->A
  // naturally ride opposite lanes.
  function laneGeometry(from, to) {
    const [x0, y0] = from;
    const [x1, y1] = to;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const bend = Math.min(length * 0.3, 140);
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2 + nx * bend, cy: (y0 + y1) / 2 + ny * bend, nx, ny, length };
  }

  function pointOnLane(lane, t, offset) {
    const u = 1 - t;
    const x = u * u * lane.x0 + 2 * u * t * lane.cx + t * t * lane.x1;
    const y = u * u * lane.y0 + 2 * u * t * lane.cy + t * t * lane.y1;
    // Taper the band near both ends so arcs leave and land on the state centroid.
    const taper = Math.sin(Math.PI * t);
    return [x + lane.nx * offset * taper, y + lane.ny * offset * taper];
  }

  function corridorColor(corridor) {
    if (corridor.kind === 'IN') return INFLOW_COLOR;
    if (corridor.kind === 'OUT') return OUTFLOW_COLOR;
    return FLOW_PALETTE[hashString(corridor.key) % FLOW_PALETTE.length];
  }

  function hashString(text) {
    let hash = 7;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return hash;
  }

  // Keeps one lane per visible corridor; bands ease toward their new width.
  function syncLanes() {
    const leader = model.visible[0]?.value || 1;
    const keep = new Set();
    for (const corridor of model.visible) {
      const from = geo.centroids.get(corridor.from);
      const to = geo.centroids.get(corridor.to);
      if (!from || !to) continue;
      keep.add(corridor.key);
      const share = corridor.value / leader;
      let lane = lanes.get(corridor.key);
      if (!lane) {
        lane = { ...laneGeometry(from, to), width: 0, particles: [] };
        lanes.set(corridor.key, lane);
      }
      Object.assign(lane, { corridor, share, color: corridorColor(corridor), targetWidth: 2 + 12 * Math.sqrt(share) });
    }
    for (const key of lanes.keys()) if (!keep.has(key)) lanes.delete(key);
  }

  function pulse() {
    return 0.78 + 0.22 * Math.sin((model.period / PERIODS_PER_YEAR) * Math.PI * 2);
  }

  function isLit(lane) {
    return !model.focusKey || lane.corridor.key === model.focusKey;
  }

  function stepParticles(lane, seconds) {
    const wanted = Math.max(1, Math.round((2 + 14 * Math.pow(lane.share, 0.6)) * model.density * pulse()));
    while (lane.particles.length < wanted) {
      lane.particles.push({ t: Math.random(), offset: (Math.random() - 0.5), pace: 0.8 + Math.random() * 0.4 });
    }
    lane.particles.length = wanted;
    const travel = (seconds * model.speed * 140) / Math.max(lane.length, 60);
    for (const particle of lane.particles) {
      particle.t += travel * particle.pace;
      if (particle.t >= 1) {
        particle.t -= 1;
        particle.offset = Math.random() - 0.5;
      }
    }
  }

  // Strokes one segment per particle, `length` px long and ending at its head.
  function strokeParticles(lane, length) {
    const span = length / Math.max(lane.length, 1);
    ctx.beginPath();
    for (const particle of lane.particles) {
      const offset = particle.offset * lane.width;
      const [tx, ty] = pointOnLane(lane, Math.max(0, particle.t - span), offset);
      const [hx, hy] = pointOnLane(lane, particle.t, offset);
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
    }
    ctx.stroke();
  }

  function drawFlows(seconds) {
    const { width, height } = ui.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const { x, y, k } = geo.transform;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(ratio * k, 0, 0, ratio * k, ratio * x, ratio * y);
    ctx.lineCap = 'round';

    const lineScale = 1 / Math.sqrt(k);
    for (const lane of lanes.values()) {
      lane.width += (lane.targetWidth - lane.width) * Math.min(1, seconds * 6);
      stepParticles(lane, seconds);
      const strength = isLit(lane) ? 1 : DIM_ALPHA;
      const hovered = lane.corridor.key === model.hoverKey;
      ctx.strokeStyle = lane.color;
      ctx.globalAlpha = TRAIL_ALPHA * strength;
      ctx.lineWidth = 1.4 * lineScale;
      strokeParticles(lane, TRAIL_PX);
      ctx.globalAlpha = HEAD_ALPHA * strength;
      ctx.lineWidth = (hovered ? 3.4 : 2.2) * lineScale;
      strokeParticles(lane, HEAD_PX);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- panel rendering

  function statusText() {
    const where = model.state || 'All states';
    return `${currentYear()} (P${model.period + 1}/${PERIODS_PER_YEAR}) | ${where} | ${DIRECTION_TAG[model.direction]} | ${model.visible.length} visible corridors`;
  }

  function renderStatus() {
    if (model.live) ui.status.textContent = statusText();
    ui.yearChip.textContent = currentYear();
    ui.periodChip.textContent = `P${model.period + 1}/${PERIODS_PER_YEAR}`;
  }

  function renderTiles(stats) {
    const tiles = [
      ['Visible Migrants (Annual)', compact.format(stats.visible)],
      ['Visible Corridors', whole.format(stats.count)],
      ['Inflow (Annual)', compact.format(stats.inflow)],
      ['Outflow (Annual)', compact.format(stats.outflow)],
      ['Net (Annual)', signedCompact.format(stats.net), stats.net > 0 ? 'is-gain' : stats.net < 0 ? 'is-loss' : ''],
      ['Total Year Volume (Annual)', compact.format(stats.total)],
    ];
    ui.tiles.replaceChildren(...tiles.map(([label, value, tone]) => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      const term = document.createElement('dt');
      term.textContent = label;
      const figure = document.createElement('dd');
      figure.textContent = value;
      if (tone) figure.className = tone;
      tile.append(term, figure);
      return tile;
    }));
  }

  function corridorLabel(corridor) {
    return `[${corridor.kind}] ${corridor.from} -> ${corridor.to}: ${whole.format(corridor.value)}/yr`;
  }

  function renderLeaders() {
    const top = model.visible.slice(0, RANKING_SIZE);
    if (!top.length) {
      const empty = document.createElement('li');
      empty.className = 'leader leader--empty';
      empty.textContent = 'No corridors visible for this filter.';
      ui.leaders.replaceChildren(empty);
      return;
    }
    const leader = top[0].value;
    ui.leaders.replaceChildren(...top.map((corridor) => {
      const item = document.createElement('li');
      item.className = 'leader';
      item.dataset.key = corridor.key;
      item.style.setProperty('--share', `${(corridor.value / leader) * 100}%`);
      const text = document.createElement('span');
      text.textContent = corridorLabel(corridor);
      item.append(text);
      item.addEventListener('pointerenter', () => {
        model.hoverKey = corridor.key;
        ui.detail.textContent = corridorLabel(corridor);
      });
      item.addEventListener('pointerleave', () => {
        model.hoverKey = null;
        ui.detail.textContent = 'Hover a state or corridor for detail.';
      });
      item.addEventListener('click', () => toggleCorridorFocus(corridor.key));
      return item;
    }));
    paintLeaderFocus();
  }

  function paintLeaderFocus() {
    for (const item of ui.leaders.querySelectorAll('.leader[data-key]')) {
      item.classList.toggle('is-active', item.dataset.key === model.focusKey);
    }
  }

  // Recomputes everything that depends on the filters or the year.
  function refresh() {
    if (!model.ready) return;
    model.visible = selectCorridors();
    if (model.focusKey && !model.visible.some((c) => c.key === model.focusKey)) model.focusKey = null;
    syncLanes();
    renderStatus();
    renderTiles(summarize(model.visible));
    renderLeaders();
  }

  // ---------------------------------------------------------------- interactions

  // Hovering a border only reports that state's totals in the detail line.
  function hoverState(name) {
    if (!name || !model.ready) {
      ui.detail.textContent = 'Hover a state or corridor for detail.';
      return;
    }
    const totals = stateTotals(name);
    ui.detail.textContent = `${name} | In ${compact.format(totals.inflow)}/yr | Out ${compact.format(totals.outflow)}/yr | Net ${signedCompact.format(totals.net)}/yr`;
  }

  function toggleCorridorFocus(key) {
    model.focusKey = model.focusKey === key ? null : key;
    paintLeaderFocus();
  }

  // Clicking a border selects that state in the State filter; clicking it again returns to all states.
  function toggleStateFilter(name) {
    model.state = model.state === name ? '' : name;
    ui.state.value = model.state;
    refresh();
  }

  function clearFocus() {
    model.focusKey = null;
    model.hoverKey = null;
    ui.detail.textContent = 'Hover a state or corridor for detail.';
    paintLeaderFocus();
  }

  function setPlaying(playing) {
    model.playing = playing;
    ui.play.textContent = playing ? 'Pause' : 'Play';
  }

  function syncSliderChips() {
    ui.corridorChip.textContent = String(model.corridors);
    ui.densityChip.textContent = `${model.density.toFixed(1)}x`;
    ui.speedChip.textContent = `${model.speed.toFixed(1)}x`;
  }

  function resetFilters() {
    Object.assign(model, DEFAULTS);
    model.yearIndex = model.years.length - 1;
    ui.year.value = String(model.yearIndex);
    ui.state.value = DEFAULTS.state;
    ui.direction.value = DEFAULTS.direction;
    ui.corridors.value = String(DEFAULTS.corridors);
    ui.density.value = String(DEFAULTS.density);
    ui.speed.value = String(DEFAULTS.speed);
    syncSliderChips();
    clearFocus();
    hoverState(null);
    refresh();
  }

  function bindControls() {
    ui.collapse.addEventListener('click', () => {
      const collapsed = ui.console.classList.toggle('is-collapsed');
      ui.collapse.textContent = collapsed ? 'Expand' : 'Minimize';
      ui.collapse.setAttribute('aria-expanded', String(!collapsed));
    });
    ui.year.addEventListener('input', () => {
      model.yearIndex = +ui.year.value;
      refresh();
    });
    ui.play.addEventListener('click', () => setPlaying(!model.playing));
    ui.resetFilters.addEventListener('click', resetFilters);
    ui.clearFocus.addEventListener('click', clearFocus);
    ui.resetView.addEventListener('click', () => {
      ui.hit.transition().duration(RESET_VIEW_MS).call(zoom.transform, d3.zoomIdentity);
    });
    ui.state.addEventListener('change', () => {
      model.state = ui.state.value;
      refresh();
    });
    ui.direction.addEventListener('change', () => {
      model.direction = ui.direction.value;
      refresh();
    });
    ui.corridors.addEventListener('input', () => {
      model.corridors = +ui.corridors.value;
      syncSliderChips();
      refresh();
    });
    // Density and speed only change how particles are drawn, not which corridors exist.
    ui.density.addEventListener('input', () => {
      model.density = +ui.density.value;
      syncSliderChips();
    });
    ui.speed.addEventListener('input', () => {
      model.speed = +ui.speed.value;
      syncSliderChips();
    });
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        geo.transform = d3.zoomIdentity;
        ui.hit.call(zoom.transform, d3.zoomIdentity);
        layoutMap();
      });
    });
  }

  // ---------------------------------------------------------------- clock

  let lastFrame = performance.now();
  let periodClock = 0;

  function frame(now) {
    // The period clock follows wall time (capped after a background tab);
    // particle motion uses a small capped step so slow frames never jump.
    const elapsed = Math.min(1000, now - lastFrame);
    const seconds = Math.min(0.05, elapsed / 1000);
    lastFrame = now;
    if (model.ready) {
      periodClock += elapsed;
      while (periodClock >= PERIOD_MS) {
        periodClock -= PERIOD_MS;
        advancePeriod();
      }
      drawFlows(seconds);
    }
    requestAnimationFrame(frame);
  }

  function advancePeriod() {
    model.period = (model.period + 1) % PERIODS_PER_YEAR;
    if (model.period === 0 && model.playing) {
      model.yearIndex = (model.yearIndex + 1) % model.years.length;
      ui.year.value = String(model.yearIndex);
      refresh();
      return;
    }
    renderStatus();
  }

  // ---------------------------------------------------------------- start

  function hidePanelForCapture() {
    const params = new URLSearchParams(location.search);
    if (params.get('export') === '1' || params.get('ui') === '0' || params.get('panel') === '0') {
      document.body.classList.add('no-console');
    }
  }

  async function start() {
    hidePanelForCapture();
    bindControls();
    syncSliderChips();
    requestAnimationFrame(frame);
    try {
      const [atlas, rows] = await Promise.all([d3.json(ATLAS_URL), d3.csv(DATA_URL)]);
      buildMap(atlas);
      const usable = groupRows(rows, new Set(geo.centroids.keys()));
      for (const name of [...geo.centroids.keys()].filter((n) => n !== 'Puerto Rico').sort()) {
        ui.state.append(new Option(name, name));
      }
      model.yearIndex = model.years.length - 1;
      ui.year.max = String(model.years.length - 1);
      ui.year.value = String(model.yearIndex);
      model.ready = true;
      ui.status.textContent = `Loaded ${whole.format(usable)} usable rows across ${model.years.length} years`;
      refresh();
      setTimeout(() => {
        model.live = true;
        renderStatus();
      }, LOADED_NOTICE_MS);
    } catch (error) {
      ui.status.textContent = 'The map or migration data could not be loaded.';
      throw error;
    }
  }

  start();
})();
