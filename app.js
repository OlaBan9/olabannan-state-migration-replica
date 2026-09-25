/* US state-to-state migration dot flows — clean-room implementation.
 * Renders Census migration corridors as animated dot arcs over a D3 map. */
"use strict";

const FIPS = {"01":"Alabama","02":"Alaska","04":"Arizona","05":"Arkansas","06":"California","08":"Colorado","09":"Connecticut","10":"Delaware","11":"District of Columbia","12":"Florida","13":"Georgia","15":"Hawaii","16":"Idaho","17":"Illinois","18":"Indiana","19":"Iowa","20":"Kansas","21":"Kentucky","22":"Louisiana","23":"Maine","24":"Maryland","25":"Massachusetts","26":"Michigan","27":"Minnesota","28":"Mississippi","29":"Missouri","30":"Montana","31":"Nebraska","32":"Nevada","33":"New Hampshire","34":"New Jersey","35":"New Mexico","36":"New York","37":"North Carolina","38":"North Dakota","39":"Ohio","40":"Oklahoma","41":"Oregon","42":"Pennsylvania","44":"Rhode Island","45":"South Carolina","46":"South Dakota","47":"Tennessee","48":"Texas","49":"Utah","50":"Vermont","51":"Virginia","53":"Washington","54":"West Virginia","55":"Wisconsin","56":"Wyoming","72":"Puerto Rico","60":"American Samoa","66":"Guam","69":"Northern Mariana Islands","78":"US Virgin Islands"};
const ABBR = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Puerto Rico":"PR","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"};

const MAX_PARTICLES = 42000;
const EASE_RATE = 7.8;
const DOT_RADIUS = 1.35;
const INK = { in: [79, 117, 151], out: [154, 109, 79] };
const PERIODS = 12;
const PERIOD_SECONDS = 0.45;

const fmtInt = new Intl.NumberFormat("en-US");
const fmtCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const S = {
  projection: d3.geoAlbersUsa(),
  path: d3.geoPath(),
  nation: null,
  states: [],
  centroids: new Map(),
  activeStates: new Set(),
  palette: new Map(),
  flowsByYear: new Map(),
  totalsByYearState: new Map(),
  yearTotals: new Map(),
  years: [],
  yearIdx: 0,
  state: "ALL",
  mode: "both",
  topN: 180,
  density: 1.6,
  speed: 1,
  activeFlows: [],
  routes: new Map(),
  particles: [],
  w: 0,
  h: 0,
  dpr: Math.max(1, window.devicePixelRatio || 1),
  playing: false,
  periodIdx: 0,
  periodT: 0,
  hoverKey: null,
  focusKey: null,
  basePaths: null,
  overlayPaths: null,
  baseRoot: null,
  overlayRoot: null,
  zoom: null,
  zoomT: d3.zoomIdentity,
  minimized: false,
  skipped: 0,
};

const stage = document.getElementById("stage");
const canvas = document.getElementById("flowCanvas");
const ctx = canvas.getContext("2d", { alpha: true });
const baseSvg = d3.select("#mapBase");
const overlaySvg = d3.select("#mapOverlay");
const params = new URLSearchParams(window.location.search);
if (params.get("export") === "1" || params.get("ui") === "0" || params.get("panel") === "0") {
  document.querySelector(".panel").style.display = "none";
}

const el = { panel: document.querySelector(".panel") };
["panelToggleBtn", "resetViewBtn", "status", "contextLine", "yearSlider", "yearBadge",
  "periodBadge", "playBtn", "resetBtn", "clearCorridorBtn", "stateSelect", "modeSelect",
  "topNSlider", "topNBadge", "densitySlider", "densityBadge", "speedSlider", "speedBadge",
  "visibleMigrants", "visibleCorridors", "inflowValue", "outflowValue", "netValue", "netCard",
  "yearVolumeValue", "topCorridors"
].forEach((id) => { el[id] = document.getElementById(id); });

const currentYear = () => S.years[S.yearIdx];
const setStatus = (t) => { el.status.textContent = t; };
const setContext = (t) => { el.contextLine.textContent = t; };
const DEFAULT_CONTEXT = "Hover a state or corridor for detail.";

function buildPalette(states) {
  const m = new Map();
  [...states].sort((a, b) => a.localeCompare(b)).forEach((s, i) => {
    m.set(s, { h: (i * 137.508) % 360, s: 40, l: 46 });
  });
  return m;
}
function stateColor(name, a = 1) {
  const c = S.palette.get(name) || { h: 210, s: 32, l: 44 };
  return `hsla(${c.h.toFixed(1)},${c.s}%,${c.l}%,${a})`;
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function directionOf(f) {
  if (S.state !== "ALL") {
    if (f.to === S.state) return "in";
    if (f.from === S.state) return "out";
  }
  if (S.mode === "in") return "in";
  if (S.mode === "out") return "out";
  return "neutral";
}
function laneSide(f) {
  if (S.state !== "ALL" && S.mode === "both") {
    if (f.from === S.state) return 1;
    if (f.to === S.state) return -1;
  }
  return f.from < f.to ? 1 : -1;
}
function routeGain(r) {
  let m = 1;
  if (S.focusKey && r.key !== S.focusKey) m *= 0.35;
  if (S.hoverKey) m *= (r.key === S.hoverKey ? 1.45 : 0.55);
  return m;
}
function routePaint(r, a) {
  const k = Math.max(0, Math.min(1, a * routeGain(r)));
  if (r.dir === "in") return rgba(INK.in, k);
  if (r.dir === "out") return rgba(INK.out, k);
  return stateColor(r.col, k);
}
function corridorLabel(f) {
  const d = directionOf(f);
  const tag = d === "in" ? "IN" : d === "out" ? "OUT" : "FLOW";
  return `[${tag}] ${f.from} -> ${f.to}: ${fmtInt.format(Math.round(f.value))}/yr`;
}
function stateSummary(name) {
  const m = (S.totalsByYearState.get(currentYear()) || new Map()).get(name) || { in: 0, out: 0 };
  const net = m.in - m.out;
  return `${name} | In ${fmtCompact.format(Math.round(m.in))}/yr | Out ${fmtCompact.format(Math.round(m.out))}/yr | Net ${net >= 0 ? "+" : ""}${fmtCompact.format(Math.round(net))}/yr`;
}
function bezPoint(r, t) {
  const u = 1 - t;
  return {
    x: u * u * r.p0.x + 2 * u * t * r.p1.x + t * t * r.p2.x,
    y: u * u * r.p0.y + 2 * u * t * r.p1.y + t * t * r.p2.y,
  };
}
function bezTangent(r, t) {
  const dx = 2 * (1 - t) * (r.p1.x - r.p0.x) + 2 * t * (r.p2.x - r.p1.x);
  const dy = 2 * (1 - t) * (r.p1.y - r.p0.y) + 2 * t * (r.p2.y - r.p1.y);
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
}
function refreshBadges() {
  el.yearBadge.textContent = String(currentYear() || "-");
  el.periodBadge.textContent = `P${S.periodIdx + 1}/${PERIODS}`;
  el.topNBadge.textContent = String(S.topN);
  el.densityBadge.textContent = `${S.density.toFixed(1)}x`;
  el.speedBadge.textContent = `${S.speed.toFixed(1)}x`;
}
function stopPlayback() { S.playing = false; el.playBtn.textContent = "Play"; }
function togglePlayback() { S.playing = !S.playing; el.playBtn.textContent = S.playing ? "Pause" : "Play"; }
function setMinimized(min) {
  S.minimized = !!min;
  el.panel.classList.toggle("minimized", S.minimized);
  el.panelToggleBtn.textContent = S.minimized ? "Expand" : "Minimize";
  el.panelToggleBtn.setAttribute("aria-expanded", String(!S.minimized));
}
function applyView() {
  const t = S.zoomT;
  if (S.baseRoot) S.baseRoot.attr("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
  if (S.overlayRoot) S.overlayRoot.attr("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
}
function setupZoom() {
  S.zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[-S.w * 2, -S.h * 2], [S.w * 3, S.h * 3]])
    .on("zoom", (ev) => { S.zoomT = ev.transform; applyView(); });
  d3.select(stage).call(S.zoom).on("dblclick.zoom", null);
}
function resetView(animate = true) {
  S.zoomT = d3.zoomIdentity;
  applyView();
  if (!S.zoom) return;
  const sel = d3.select(stage);
  if (animate) sel.transition().duration(240).call(S.zoom.transform, d3.zoomIdentity);
  else sel.call(S.zoom.transform, d3.zoomIdentity);
}
function rebuildCentroids() {
  S.centroids.clear();
  S.states.forEach((f) => {
    const n = f.properties.name, c = S.path.centroid(f);
    if (n && Number.isFinite(c[0]) && Number.isFinite(c[1])) S.centroids.set(n, { x: c[0], y: c[1] });
  });
}
function paintStateSelection() {
  if (!S.basePaths || !S.overlayPaths) return;
  S.basePaths.attr("fill", (d) => !S.activeStates.has(d.properties.name) ? "#f0f2f4"
    : (S.state !== "ALL" && d.properties.name === S.state ? "var(--stateSel)" : "var(--state)"));
  S.overlayPaths
    .attr("stroke", (d) => !S.activeStates.has(d.properties.name) ? "#bec6ce"
      : (S.state !== "ALL" && d.properties.name === S.state ? "var(--borderStrong)" : "var(--border)"))
    .attr("stroke-width", (d) => S.state !== "ALL" && d.properties.name === S.state ? 1.8 : 1);
}
function drawMap() {
  baseSvg.selectAll("*").remove();
  overlaySvg.selectAll("*").remove();
  S.baseRoot = baseSvg.append("g");
  S.overlayRoot = overlaySvg.append("g");
  S.baseRoot.append("path").datum(S.nation).attr("class", "nation").attr("d", S.path);
  S.basePaths = S.baseRoot.append("g").selectAll("path").data(S.states).join("path")
    .attr("class", "sfill").attr("d", S.path);
  S.overlayPaths = S.overlayRoot.append("g").selectAll("path").data(S.states).join("path")
    .attr("class", (d) => S.activeStates.has(d.properties.name) ? "sline on" : "sline off")
    .attr("d", S.path)
    .on("mouseenter", (_, d) => {
      const n = d.properties.name;
      if (!S.activeStates.has(n)) return;
      setContext(stateSummary(n));
    })
    .on("mouseleave", () => setContext(DEFAULT_CONTEXT))
    .on("click", (_, d) => {
      const n = d.properties.name;
      if (!S.activeStates.has(n)) return;
      S.state = S.state === n ? "ALL" : n;
      el.stateSelect.value = S.state;
      rebuild();
    });
  const labels = S.states
    .filter((f) => S.activeStates.has(f.properties.name))
    .map((f) => {
      const n = f.properties.name, c = S.centroids.get(n);
      if (!c) return null;
      return { abbr: ABBR[n] || "", x: c.x, y: c.y, small: S.path.area(f) < 360 };
    })
    .filter(Boolean);
  S.overlayRoot.append("g").selectAll("text").data(labels).join("text")
    .attr("class", (d) => d.small ? "slabel small" : "slabel")
    .attr("x", (d) => d.x).attr("y", (d) => d.y + 2).text((d) => d.abbr);
  applyView();
  paintStateSelection();
}
const flowVisible = (f) => S.state === "ALL" || (S.mode === "both"
  ? (f.from === S.state || f.to === S.state)
  : (S.mode === "out" ? f.from === S.state : f.to === S.state));

function retargetRoute(r, f, n) {
  n = Math.max(0.01, n);
  r.from = f.from; r.to = f.to; r.value = f.value; r.col = f.from;
  r.dir = directionOf(f); r.side = laneSide(f);
  r.tw = n;
  r.tSpawn = 4 + n * 140;
  r.tW = 0.9 + Math.pow(n, 0.65) * 9.3;
  r.tDot = 1;
  r.tSpread = 1.2 + Math.pow(n, 0.9) * 15;
  r.tSpeed = 0.19 + n * 0.33;
  r.lineA = 0.06 + n * 0.28;
  r.dotA = 0.34 + n * 0.42;
  if (r.dir !== "neutral") { r.lineA += 0.08; r.dotA += 0.08; }
}
function makeRoute(f, maxV) {
  const a = S.centroids.get(f.from), b = S.centroids.get(f.to);
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d < 2) return null;
  const n = Math.max(0.01, f.value / maxV);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const nx = -dy / d, ny = dx / d, sgn = laneSide(f);
  const boost = (S.state !== "ALL" && S.mode === "both") ? 2.2 : 1;
  const curve = Math.min(108, d * (0.2 + 0.17 * n));
  const lane = (1.5 + 4.8 * n) * sgn * boost;
  const r = {
    key: `${f.from}|${f.to}`,
    p0: { x: a.x + nx * lane, y: a.y + ny * lane },
    p1: { x: mx + nx * (curve * sgn + lane * 0.7), y: my + ny * (curve * sgn + lane * 0.7) },
    p2: { x: b.x + nx * lane, y: b.y + ny * lane },
    from: f.from, to: f.to, value: f.value, col: f.from, dir: "neutral",
    w: 0, tw: 0, spawn: 0, tSpawn: 0, bw: 0.2, tW: 0.2,
    dot: 1, tDot: 1, spread: 0.35, tSpread: 0.35, spd: 0.18, tSpeed: 0.18,
    lineA: 0.08, dotA: 0.3, carry: Math.random(),
  };
  retargetRoute(r, f, n);
  return r;
}
function updateStats() {
  const yearTot = S.yearTotals.get(currentYear()) || 0;
  const vis = S.activeFlows.reduce((s, f) => s + f.value, 0);
  let inflow = 0, outflow = 0;
  if (S.state === "ALL") { inflow = vis; outflow = vis; }
  else {
    inflow = S.activeFlows.reduce((s, f) => s + (f.to === S.state ? f.value : 0), 0);
    outflow = S.activeFlows.reduce((s, f) => s + (f.from === S.state ? f.value : 0), 0);
  }
  const net = inflow - outflow;
  el.visibleMigrants.textContent = fmtCompact.format(Math.round(vis));
  el.visibleCorridors.textContent = fmtInt.format(S.activeFlows.length);
  el.inflowValue.textContent = fmtCompact.format(Math.round(inflow));
  el.outflowValue.textContent = fmtCompact.format(Math.round(outflow));
  el.netValue.textContent = `${net >= 0 ? "+" : ""}${fmtCompact.format(Math.round(net))}`;
  el.yearVolumeValue.textContent = fmtCompact.format(Math.round(yearTot));
  el.netCard.classList.remove("positive", "negative");
  if (net > 0) el.netCard.classList.add("positive");
  else if (net < 0) el.netCard.classList.add("negative");
}
function updateTopList() {
  el.topCorridors.innerHTML = "";
  const top = S.activeFlows.slice(0, 10);
  const max = top.length ? top[0].value : 1;
  top.forEach((f) => {
    const key = `${f.from}|${f.to}`;
    const li = document.createElement("li");
    const bar = document.createElement("span");
    const txt = document.createElement("span");
    bar.className = "bar";
    bar.style.width = `${Math.max(4, (f.value / max) * 100)}%`;
    txt.className = "txt";
    txt.textContent = corridorLabel(f);
    li.appendChild(bar);
    li.appendChild(txt);
    if (S.focusKey === key) li.classList.add("active");
    li.addEventListener("mouseenter", () => { S.hoverKey = key; setContext(corridorLabel(f)); });
    li.addEventListener("mouseleave", () => { S.hoverKey = null; setContext(DEFAULT_CONTEXT); });
    li.addEventListener("click", () => {
      S.focusKey = S.focusKey === key ? null : key;
      updateTopList();
    });
    el.topCorridors.appendChild(li);
  });
  if (!top.length) {
    const li = document.createElement("li");
    li.textContent = "No corridors visible for this filter.";
    el.topCorridors.appendChild(li);
  }
}
function rebuild(clearParticles = false) {
  if (!S.years.length) return;
  refreshBadges();
  paintStateSelection();
  const flows = (S.flowsByYear.get(currentYear()) || [])
    .filter(flowVisible).sort((a, b) => b.value - a.value).slice(0, S.topN);
  const max = flows.length ? flows[0].value : 1;
  const touched = new Set();
  S.activeFlows = flows;
  flows.forEach((f) => {
    const k = `${f.from}|${f.to}`;
    touched.add(k);
    let r = S.routes.get(k);
    if (!r) {
      r = makeRoute(f, max);
      if (!r) return;
      S.routes.set(k, r);
    } else {
      const fresh = makeRoute(f, max);
      if (!fresh) return;
      r.p0 = fresh.p0; r.p1 = fresh.p1; r.p2 = fresh.p2;
    }
    retargetRoute(r, f, f.value / max);
  });
  if (S.focusKey && !touched.has(S.focusKey)) S.focusKey = null;
  for (const [k, r] of S.routes.entries()) {
    if (touched.has(k)) continue;
    r.tw = 0; r.tSpawn = 0; r.tW = 0.2; r.tDot = 1; r.tSpread = 0.2; r.tSpeed = 0.14;
    r.lineA = 0.02; r.dotA = 0.14;
  }
  if (clearParticles) S.particles = [];
  updateStats();
  updateTopList();
  const m = S.mode === "both" ? "IN + OUT" : S.mode.toUpperCase();
  const s = S.state === "ALL" ? "All states" : S.state;
  setStatus(`${currentYear()} (P${S.periodIdx + 1}/${PERIODS}) | ${s} | ${m} | ${fmtInt.format(S.activeFlows.length)} visible corridors`);
}
function easeRoutes(dt) {
  const t = 1 - Math.exp(-EASE_RATE * dt);
  for (const [k, r] of S.routes.entries()) {
    r.w += (r.tw - r.w) * t;
    r.spawn += (r.tSpawn - r.spawn) * t;
    r.bw += (r.tW - r.bw) * t;
    r.dot += (r.tDot - r.dot) * t;
    r.spread += (r.tSpread - r.spread) * t;
    r.spd += (r.tSpeed - r.spd) * t;
    if (r.w < 0.001 && r.tw === 0) S.routes.delete(k);
  }
}
function spawnDots(dt) {
  const share = 1 / PERIODS;
  const pulse = 0.86 + 0.28 * Math.sin(Math.PI * (S.periodT / PERIOD_SECONDS));
  for (const r of S.routes.values()) {
    if (r.w < 0.01) continue;
    const emphasis = S.focusKey && r.key !== S.focusKey ? 0.35 : 1;
    r.carry += r.spawn * S.density * r.w * dt * share * pulse * emphasis;
    while (r.carry >= 1 && S.particles.length < MAX_PARTICLES) {
      r.carry -= 1;
      const lane = r.dir === "in" ? -(.08 + Math.pow(Math.random(), .7) * .92)
        : r.dir === "out" ? .08 + Math.pow(Math.random(), .7) * .92
        : (Math.random() * 2 - 1);
      S.particles.push({
        r, t: Math.random() * 0.03,
        spd: r.spd * S.speed * (0.88 + Math.random() * 0.24),
        lane, a: r.dotA * (0.92 + Math.random() * 0.16),
      });
    }
  }
}
function drawDots(dt) {
  const z = S.zoomT.k || 1;
  ctx.save();
  ctx.setTransform(S.dpr * z, 0, 0, S.dpr * z, S.dpr * S.zoomT.x, S.dpr * S.zoomT.y);
  ctx.globalCompositeOperation = "multiply";
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i], r = p.r;
    p.t += p.spd * dt;
    if (p.t >= 1) {
      S.particles[i] = S.particles[S.particles.length - 1];
      S.particles.pop();
      continue;
    }
    const pos = bezPoint(r, p.t), tan = bezTangent(r, p.t);
    const spread = r.spread * (r.dir === "neutral" ? 0.95 : 0.75);
    const x = pos.x + (-tan.y) * p.lane * spread;
    const y = pos.y + tan.x * p.lane * spread;
    ctx.beginPath();
    ctx.fillStyle = routePaint(r, p.a);
    ctx.arc(x, y, DOT_RADIUS / z, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function advancePeriod(dt) {
  S.periodT += dt;
  if (S.periodT < PERIOD_SECONDS) return false;
  S.periodT -= PERIOD_SECONDS;
  S.periodIdx = (S.periodIdx + 1) % PERIODS;
  refreshBadges();
  if (S.playing && S.periodIdx === 0) {
    S.yearIdx = (S.yearIdx + 1) % S.years.length;
    el.yearSlider.value = String(S.yearIdx);
    rebuild();
  } else if (S.periodIdx === 0 || S.periodIdx === 6) {
    const m = S.mode === "both" ? "IN + OUT" : S.mode.toUpperCase();
    const s = S.state === "ALL" ? "All states" : S.state;
    setStatus(`${currentYear()} (P${S.periodIdx + 1}/${PERIODS}) | ${s} | ${m} | ${fmtInt.format(S.activeFlows.length)} visible corridors`);
  }
  return true;
}
function clearFrame() {
  ctx.save();
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(0, 0, S.w, S.h);
  ctx.restore();
}
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  advancePeriod(dt);
  clearFrame();
  easeRoutes(dt);
  spawnDots(dt);
  drawDots(dt);
  requestAnimationFrame(frame);
}
function indexFlows(rows) {
  const byYear = new Map(), totBy = new Map(), yearTot = new Map(), states = new Set();
  let skipped = 0;
  rows.forEach((row) => {
    const y = parseInt((row.year_start || "").trim(), 10);
    const v = parseFloat(row.estimate);
    const from = (row.from_state || "").trim(), to = (row.to_state || "").trim();
    if (!Number.isFinite(y) || !Number.isFinite(v) || v <= 0 || !from || !to || from === to) { skipped++; return; }
    if (!S.centroids.has(from) || !S.centroids.has(to)) { skipped++; return; }
    const f = { year: y, from, to, value: v };
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(f);
    if (!totBy.has(y)) totBy.set(y, new Map());
    const m = totBy.get(y);
    if (!m.has(from)) m.set(from, { in: 0, out: 0 });
    if (!m.has(to)) m.set(to, { in: 0, out: 0 });
    m.get(from).out += v;
    m.get(to).in += v;
    yearTot.set(y, (yearTot.get(y) || 0) + v);
    states.add(from); states.add(to);
  });
  for (const [y, f] of byYear.entries()) { f.sort((a, b) => b.value - a.value); byYear.set(y, f); }
  S.skipped = skipped;
  return {
    byYear, totBy, yearTot,
    states: [...states].sort((a, b) => a.localeCompare(b)),
    years: [...byYear.keys()].sort((a, b) => a - b),
  };
}
function populateControls() {
  el.stateSelect.innerHTML = "";
  const all = document.createElement("option");
  all.value = "ALL"; all.textContent = "All States";
  el.stateSelect.appendChild(all);
  [...S.activeStates].sort((a, b) => a.localeCompare(b)).forEach((s) => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    el.stateSelect.appendChild(o);
  });
  el.yearSlider.min = "0";
  el.yearSlider.max = String(Math.max(0, S.years.length - 1));
  el.yearSlider.value = String(S.yearIdx);
  el.stateSelect.value = S.state;
  el.modeSelect.value = S.mode;
  el.topNSlider.value = String(S.topN);
  el.densitySlider.value = S.density.toFixed(1);
  el.speedSlider.value = S.speed.toFixed(1);
  refreshBadges();
}
function resize() {
  S.w = stage.clientWidth; S.h = stage.clientHeight;
  S.dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(S.w * S.dpr);
  canvas.height = Math.round(S.h * S.dpr);
  canvas.style.width = `${S.w}px`;
  canvas.style.height = `${S.h}px`;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.clearRect(0, 0, S.w, S.h);
  baseSvg.attr("viewBox", `0 0 ${S.w} ${S.h}`);
  overlaySvg.attr("viewBox", `0 0 ${S.w} ${S.h}`);
  if (S.zoom) S.zoom.translateExtent([[-S.w * 2, -S.h * 2], [S.w * 3, S.h * 3]]);
  S.projection.fitSize([S.w, S.h], S.nation);
  S.path = d3.geoPath(S.projection);
  rebuildCentroids();
  drawMap();
  S.routes.clear();
  S.particles = [];
  rebuild(true);
}
function wireEvents() {
  el.yearSlider.addEventListener("input", () => {
    S.yearIdx = parseInt(el.yearSlider.value, 10) || 0;
    S.periodIdx = 0; S.periodT = 0;
    rebuild();
  });
  el.playBtn.addEventListener("click", togglePlayback);
  el.resetBtn.addEventListener("click", () => {
    stopPlayback();
    S.state = "ALL"; S.mode = "both"; S.topN = 180; S.density = 1.6; S.speed = 1;
    S.yearIdx = Math.max(0, S.years.length - 1);
    S.periodIdx = 0; S.periodT = 0;
    S.focusKey = null; S.hoverKey = null;
    setContext(DEFAULT_CONTEXT);
    el.stateSelect.value = S.state;
    el.modeSelect.value = S.mode;
    el.topNSlider.value = String(S.topN);
    el.densitySlider.value = S.density.toFixed(1);
    el.speedSlider.value = S.speed.toFixed(1);
    el.yearSlider.value = String(S.yearIdx);
    rebuild();
  });
  el.clearCorridorBtn.addEventListener("click", () => {
    S.focusKey = null; S.hoverKey = null;
    setContext(DEFAULT_CONTEXT);
    updateTopList();
  });
  el.resetViewBtn.addEventListener("click", () => resetView(true));
  el.panelToggleBtn.addEventListener("click", () => setMinimized(!S.minimized));
  el.stateSelect.addEventListener("change", () => { S.state = el.stateSelect.value; rebuild(); });
  el.modeSelect.addEventListener("change", () => { S.mode = el.modeSelect.value; rebuild(); });
  el.topNSlider.addEventListener("input", () => {
    S.topN = parseInt(el.topNSlider.value, 10) || 180;
    rebuild();
  });
  el.densitySlider.addEventListener("input", () => {
    S.density = parseFloat(el.densitySlider.value) || 1;
    refreshBadges();
  });
  el.speedSlider.addEventListener("input", () => {
    S.speed = parseFloat(el.speedSlider.value) || 1;
    refreshBadges();
  });
  window.addEventListener("resize", resize);
}
async function init() {
  try {
    const [us, csv] = await Promise.all([
      d3.json("./vendor/states-10m.json"),
      d3.text("./state_to_state_migration_normalized.csv"),
    ]);
    S.nation = topojson.feature(us, us.objects.nation);
    S.states = topojson.feature(us, us.objects.states).features
      .map((f) => ({ ...f, properties: { ...(f.properties || {}), name: FIPS[String(f.id).padStart(2, "0")] || null } }))
      .filter((f) => f.properties.name !== null);
    S.projection.fitSize([stage.clientWidth, stage.clientHeight], S.nation);
    S.path = d3.geoPath(S.projection);
    rebuildCentroids();
    const rows = d3.csvParse(csv);
    const idx = indexFlows(rows);
    S.flowsByYear = idx.byYear;
    S.totalsByYearState = idx.totBy;
    S.yearTotals = idx.yearTot;
    S.years = idx.years;
    S.activeStates = new Set(idx.states);
    S.palette = buildPalette(idx.states);
    S.yearIdx = Math.max(0, S.years.length - 1);
    populateControls();
    wireEvents();
    resize();
    setupZoom();
    resetView(false);
    setMinimized(false);
    setStatus(`Loaded ${fmtInt.format(rows.length - S.skipped)} usable rows across ${S.years.length} years.`);
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    setStatus("Could not load data. Use: python -m http.server 8787");
  }
}
init();
