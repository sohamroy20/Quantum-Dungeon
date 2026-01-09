import "./style.css";
import { PlanarLattice } from "./game/lattice";
import type { Face } from "./game/lattice";
import { RNG } from "./game/noise";

type Vec2 = { x: number; y: number };

type Defect = {
  id: string;
  fx: number;
  fy: number;
  kind: "Z";
};

type Segment = { a: Vec2; b: Vec2 };

type DrawnPath = {
  segments: Segment[];
  t0: number;
  durationMs: number;
};

const canvas = document.getElementById("board") as HTMLCanvasElement;
const ctxMaybe = canvas.getContext("2d");
if (!ctxMaybe) throw new Error("2D canvas context not supported");
const ctx = ctxMaybe;

/* ---------------- HUD ---------------- */
const hudP = document.getElementById("hud-p")!;
const hudEnergy = document.getElementById("hud-energy")!;
const hudTurn = document.getElementById("hud-turn")!;
const hudDefects = document.getElementById("hud-defects")!;
const hudScore = document.getElementById("hud-score")!;
const hudTime = document.getElementById("hud-time")!;
const hudBest = document.getElementById("hud-best")!;

const statusEl = document.getElementById("status")!;

const btnScan = document.getElementById("btn-scan") as HTMLButtonElement;
const btnEndTurn = document.getElementById("btn-endturn") as HTMLButtonElement;
const btnRestart = document.getElementById("btn-restart") as HTMLButtonElement;

/* ---------------- High score persistence ---------------- */
const BEST_KEY = "quantum-dungeon-best";
const initialBest = Number(localStorage.getItem(BEST_KEY) || 0);

/* ---------------- Tutorial ---------------- */
const tutorial = [
  "Glowing dots are defects (anyons): problems caused by noise.",
  "Click TWO defects to draw a correction path.",
  "Scan can suggest a good pair if you're unsure.",
  "End Turn advances time. Noise appears every 2 turns (beginner mode).",
  "Avoid making a chain from TOP to BOTTOM — that's a logical failure.",
];

const state = {
  // lattice size (faces)
  gridW: 11,
  gridH: 7,
  pad: 48,
  cell: 64,

  turn: 1,
  energy: 12,
  pNoise: 0.08,

  score: 0,
  bestScore: initialBest,
  energySpentThisTurn: 0,
  gameOver: false,

  // timer
  startTime: performance.now(),
  elapsedSec: 0,
  lastTurnSec: 0, // per-turn time delta

  // tutorial
  tutorialStep: 0,

  // scan hint
  hintPair: null as null | [Defect, Defect],
  hintUntil: 0,

  defects: [] as Defect[],
  selected: [] as Defect[],
  paths: [] as DrawnPath[],
};

const lattice = new PlanarLattice(state.gridW, state.gridH);
const rng = new RNG(0xC0FFEE);

function setStatus(s: string) {
  if (state.tutorialStep < tutorial.length) {
    statusEl.textContent = `TIP: ${tutorial[state.tutorialStep]} — ${s}`;
  } else {
    statusEl.textContent = s;
  }
}

function updateHud() {
  hudP.textContent = state.pNoise.toFixed(2);
  hudEnergy.textContent = String(state.energy);
  hudTurn.textContent = String(state.turn);
  hudDefects.textContent = String(state.defects.length);
  hudScore.textContent = String(state.score);
  hudTime.textContent = `${state.elapsedSec}s`;
  hudBest.textContent = String(state.bestScore);
}

function spendEnergy(cost: number): boolean {
  if (state.energy < cost) {
    setStatus(`Not enough energy (${state.energy}/${cost}).`);
    return false;
  }
  state.energy -= cost;
  state.energySpentThisTurn += cost;
  updateHud();
  return true;
}

function pathCost(a: Defect, b: Defect): number {
  return Math.abs(a.fx - b.fx) + Math.abs(a.fy - b.fy);
}

function cellCenter(cx: number, cy: number): Vec2 {
  return { x: state.pad + cx * state.cell, y: state.pad + cy * state.cell };
}

function syncDefectsFromLattice() {
  const faces = lattice.listDefects();
  state.defects = faces.map((f) => ({
    id: `${f.fx},${f.fy}`,
    fx: f.fx,
    fy: f.fy,
    kind: "Z",
  }));
  updateHud();
}

/* ---------------- end game + best score (LOWER is better) ---------------- */
function endGame(reason: string) {
  state.gameOver = true;

  if (state.bestScore === 0 || state.score < state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(BEST_KEY, String(state.score));
  }

  updateHud();
  setStatus(reason + " Hit Restart.");
}

function winRun() {
  endGame(`✔ SUCCESS! Decoding complete. Final score: ${state.score}.`);
}

/* ---------------- Planar loss condition (visual/optional) ---------------- */
function checkPlanarLoss() {
  const topY = state.pad;
  const bottomY = state.pad + (state.gridH - 1) * state.cell;

  for (const p of state.paths) {
    let touchesTop = false;
    let touchesBottom = false;

    for (const seg of p.segments) {
      if (seg.a.y <= topY + 2) touchesTop = true;
      if (seg.a.y >= bottomY - 2) touchesBottom = true;
    }

    if (touchesTop && touchesBottom) {
      endGame("GAME OVER: A fault chain crossed the dungeon!");
      return;
    }
  }
}

/* ---------------- Scan hint logic ---------------- */
function findClosestPair(defs: Defect[]): [Defect, Defect] | null {
  if (defs.length < 2) return null;

  let best: [Defect, Defect] | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      const a = defs[i];
      const b = defs[j];
      const d = Math.abs(a.fx - b.fx) + Math.abs(a.fy - b.fy);
      if (d < bestDist) {
        bestDist = d;
        best = [a, b];
      }
    }
  }
  return best;
}

/* ---------------- Noise helpers ----------------
   Key idea:
   - “Pair” noise should flip an INTERIOR edge (shared by two faces) => changes defects by an even amount.
   - Boundary edges can create single defects => we do NOT use them for noise injection.
*/
type Edge =
  | { kind: "h"; x: number; y: number }
  | { kind: "v"; x: number; y: number };

function randomInteriorEdge(): Edge {
  // interior horizontal edges: y in [1..H-1], x in [0..L-1]
  // interior vertical edges:   x in [1..L-1], y in [0..H-1]
  const chooseH = rng.nextFloat() < 0.5;

  if (chooseH) {
    const x = Math.floor(rng.nextFloat() * state.gridW);
    const y = 1 + Math.floor(rng.nextFloat() * (state.gridH - 1)); // 1..H-1
    return { kind: "h", x, y };
  } else {
    const x = 1 + Math.floor(rng.nextFloat() * (state.gridW - 1)); // 1..L-1
    const y = Math.floor(rng.nextFloat() * state.gridH);
    return { kind: "v", x, y };
  }
}

// Toggle an interior edge that we haven't used in this phase (avoid cancel)
function toggleFreshInteriorEdge(used: Set<string>) {
  for (let tries = 0; tries < 200; tries++) {
    const e = randomInteriorEdge();
    const key = `${e.kind}:${e.x},${e.y}`;
    if (used.has(key)) continue;
    used.add(key);
    lattice.toggleEdge(e as any);
    return;
  }
  // If we somehow fail, do nothing (safe fallback)
}

/* ---------------- Reset / start ---------------- */
function resetRun() {
  state.turn = 1;
  state.energy = 12;
  state.score = 0;
  state.energySpentThisTurn = 0;
  state.gameOver = false;

  state.paths = [];
  state.selected = [];

  state.startTime = performance.now();
  state.elapsedSec = 0;
  state.lastTurnSec = 0;

  lattice.reset();

  // Start with a high EVEN number of defects: 24/26/28
  // Achieve it by flipping 12/13/14 interior edges (each contributes “pair noise”).
  const startPairs = 12 + Math.floor(rng.nextFloat() * 3); // 12..14
  const used = new Set<string>();
  for (let i = 0; i < startPairs; i++) {
    toggleFreshInteriorEdge(used);
  }

  syncDefectsFromLattice();

  // Safety: if something unexpected still yields odd (should not), add one more interior edge.
  if (state.defects.length % 2 === 1) {
    toggleFreshInteriorEdge(used);
    syncDefectsFromLattice();
  }

  updateHud();
  setStatus("New run started. High-noise lattice initialized.");
}

/* ---------------- Drawing ---------------- */
function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.35,
    50,
    canvas.width * 0.5,
    canvas.height * 0.5,
    Math.max(canvas.width, canvas.height) * 0.75
  );
  g.addColorStop(0, "rgba(122,162,255,0.10)");
  g.addColorStop(1, "rgba(5,7,13,0.0)");
  ctx.fillStyle = g;
  ctx.shadowBlur = 0;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  const left = state.pad;
  const top = state.pad;
  const right = state.pad + (state.gridW - 1) * state.cell;
  const bottom = state.pad + (state.gridH - 1) * state.cell;

  ctx.strokeStyle = "rgba(122,162,255,0.25)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(122,162,255,0.25)";
  ctx.shadowBlur = 20;
  ctx.strokeRect(left - 16, top - 16, right - left + 32, bottom - top + 32);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(27,42,74,0.9)";
  ctx.lineWidth = 1;

  for (let x = 0; x < state.gridW; x++) {
    const px = cellCenter(x, 0).x;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
  }
  for (let y = 0; y < state.gridH; y++) {
    const py = cellCenter(0, y).y;
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
  }

  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(47,255,213,0.35)";
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,47,211,0.35)";
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
}

function drawDefects(now: number) {
  const pulse = 1 + 0.12 * Math.sin(now / 240);

  const hintActive = state.hintPair && now < state.hintUntil;
  const hintA = hintActive ? state.hintPair![0].id : "";
  const hintB = hintActive ? state.hintPair![1].id : "";

  for (const d of state.defects) {
    const { x, y } = cellCenter(d.fx, d.fy);
    const sel = state.selected.some((s) => s.id === d.id);

    const isHint = d.id === hintA || d.id === hintB;

    const fill = isHint ? "rgba(47,255,213,1.0)" : "rgba(47,255,213,0.92)";
    const glow = isHint ? "rgba(47,255,213,0.75)" : "rgba(47,255,213,0.45)";

    ctx.fillStyle = fill;
    ctx.shadowColor = glow;
    ctx.shadowBlur = isHint ? 34 : 22;

    const r = (sel ? 10 : 8) * pulse;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = sel ? "rgba(230,240,255,0.9)" : "rgba(230,240,255,0.35)";
    ctx.lineWidth = sel ? 2.2 : 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

function correctionCausesLogicalFailure(path: Segment[]): boolean {
  const topY = state.pad;
  const bottomY = state.pad + (state.gridH - 1) * state.cell;

  let touchesTop = false;
  let touchesBottom = false;

  for (const seg of path) {
    if (seg.a.y <= topY + 2 || seg.b.y <= topY + 2) {
      touchesTop = true;
    }
    if (seg.a.y >= bottomY - 2 || seg.b.y >= bottomY - 2) {
      touchesBottom = true;
    }
  }

  return touchesTop && touchesBottom;
}

function manhattanSegments(a: Defect, b: Defect): Segment[] {
  const A = cellCenter(a.fx, a.fy);
  const M = cellCenter(b.fx, a.fy);
  const B = cellCenter(b.fx, b.fy);
  return [
    { a: A, b: M },
    { a: M, b: B },
  ];
}

function drawPaths(now: number) {
  for (const p of state.paths) {
    const t = Math.min(1, (now - p.t0) / p.durationMs);

    ctx.strokeStyle = "rgba(122,162,255,0.95)";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(122,162,255,0.35)";
    ctx.shadowBlur = 18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const segCount = p.segments.length;
    const scaled = t * segCount;

    for (let i = 0; i < segCount; i++) {
      const segT = Math.max(0, Math.min(1, scaled - i));
      if (segT <= 0) continue;

      const s = p.segments[i];
      const x = s.a.x + (s.b.x - s.a.x) * segT;
      const y = s.a.y + (s.b.y - s.a.y) * segT;

      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
  }

  if (state.hintPair && now < state.hintUntil) {
    const [a, b] = state.hintPair;
    const A = cellCenter(a.fx, a.fy);
    const B = cellCenter(b.fx, b.fy);

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function hitTest(mx: number, my: number): Defect | null {
  for (const d of state.defects) {
    const c = cellCenter(d.fx, d.fy);
    const dx = mx - c.x;
    const dy = my - c.y;
    if (dx * dx + dy * dy <= 18 * 18) return d;
  }
  return null;
}

/* ---------------- Correction path on dual lattice ---------------- */
function applyCorrectionPath(a: Face, b: Face) {
  let cur: Face = { fx: a.fx, fy: a.fy };

  while (cur.fx !== b.fx) {
    const step = b.fx > cur.fx ? 1 : -1;
    const nxt = { fx: cur.fx + step, fy: cur.fy };
    lattice.applyDualStep(cur, nxt);
    cur = nxt;
  }

  while (cur.fy !== b.fy) {
    const step = b.fy > cur.fy ? 1 : -1;
    const nxt = { fx: cur.fx, fy: cur.fy + step };
    lattice.applyDualStep(cur, nxt);
    cur = nxt;
  }
}

/* ---------------- Input handlers ---------------- */
canvas.addEventListener("click", (ev) => {
  if (state.gameOver) {
    setStatus("Game over. Hit Restart.");
    return;
  }

  const r = canvas.getBoundingClientRect();
  const mx = ((ev.clientX - r.left) / r.width) * canvas.width;
  const my = ((ev.clientY - r.top) / r.height) * canvas.height;

  const d = hitTest(mx, my);
  if (!d) return;

  const already = state.selected.find((s) => s.id === d.id);
  if (already) {
    state.selected = state.selected.filter((s) => s.id !== d.id);
    setStatus("Selection removed.");
    return;
  }

  state.selected.push(d);

  if (state.selected.length === 1) {
    setStatus("Pick a second defect.");
    return;
  }

  if (state.selected.length === 2) {
    const [a, b] = state.selected;

    const cost = pathCost(a, b);
    if (!spendEnergy(cost)) {
      state.selected = [a];
      return;
    }

    // state.paths.push({
    //   segments: manhattanSegments(a, b),
    //   t0: performance.now(),
    //   durationMs: 260,
    // });

    // applyCorrectionPath({ fx: a.fx, fy: a.fy }, { fx: b.fx, fy: b.fy });
    const segments = manhattanSegments(a, b);

    // BAD DECODING → LOGICAL FAILURE
    if (correctionCausesLogicalFailure(segments)) {
      state.paths.push({
        segments,
        t0: performance.now(),
        durationMs: 260,
      });

      endGame("LOGICAL FAILURE: Correction formed a boundary-spanning chain.");
      return;
    }

    // ✅ Safe correction
    state.paths.push({
      segments,
      t0: performance.now(),
      durationMs: 260,
    });

    applyCorrectionPath({ fx: a.fx, fy: a.fy }, { fx: b.fx, fy: b.fy });

    state.selected = [];
    syncDefectsFromLattice();

    checkPlanarLoss();

    if (state.tutorialStep === 1) state.tutorialStep++;

    if (!state.gameOver) setStatus(`Correction applied (cost ${cost}). Syndrome updated.`);
    return;
  }

  state.selected = [d];
  setStatus("Reset selection. Pick a second defect.");
});

btnScan.addEventListener("click", () => {
  if (state.gameOver) {
    setStatus("Game over. Hit Restart.");
    return;
  }

  const pair = findClosestPair(state.defects);
  if (!pair) {
    state.hintPair = null;
    state.hintUntil = 0;
    setStatus("Scan complete: no pairing needed.");
    if (state.tutorialStep === 2) state.tutorialStep++;
    return;
  }

  state.hintPair = pair;
  state.hintUntil = performance.now() + 2000;
  setStatus("Scan hint: nearby defects suggested.");

  if (state.tutorialStep === 2) state.tutorialStep++;
});

btnEndTurn.addEventListener("click", () => {
  if (state.gameOver) {
    setStatus("Game over. Hit Restart.");
    return;
  }

  // score: lower is better (energy + time per turn)
  const deltaSec = Math.max(0, state.elapsedSec - state.lastTurnSec);
  state.lastTurnSec = state.elapsedSec;

  const energyCost = state.energySpentThisTurn;
  state.score += 2 * energyCost + deltaSec;
  state.energySpentThisTurn = 0;

  state.turn += 1;
  state.energy = 12;

  // Noise every 2 turns: add +2..+10 defects (i.e. 1..5 interior edge flips)
  if (state.turn % 2 === 0) {
    const pairsToAdd = 1 + Math.floor(rng.nextFloat() * 5); // 1..5
    const used = new Set<string>();
    for (let i = 0; i < pairsToAdd; i++) {
      toggleFreshInteriorEdge(used);
    }
    syncDefectsFromLattice();
  }

  if (state.defects.length === 0) {
    winRun();
    return;
  }

  setStatus(state.turn % 2 === 0 ? "Noise applied. New defects detected." : "Quiet turn. No new noise.");
  updateHud();
});

btnRestart.addEventListener("click", () => resetRun());

/* ---------------- Main loop ---------------- */
function loop(now: number) {
  if (!state.gameOver) {
    state.elapsedSec = Math.floor((now - state.startTime) / 1000);
  }

  drawBackground();
  drawGrid();
  drawPaths(now);
  drawDefects(now);

  updateHud();
  requestAnimationFrame(loop);
}

resetRun();
requestAnimationFrame(loop);