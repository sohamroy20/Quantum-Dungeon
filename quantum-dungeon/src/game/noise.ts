// src/game/noise.ts
import { PlanarLattice } from "./lattice";
//import type { Edge } from "./lattice";


/** Simple RNG wrapper so runs are reproducible if you want later. */
export class RNG {
  private s: number;
  constructor(seed = 0x12345678) {
    this.s = seed >>> 0;
  }
  nextU32(): number {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    this.s = x;
    return x;
  }
  nextFloat(): number {
    return this.nextU32() / 0xffffffff;
  }
}

/** Apply i.i.d. X-error noise to all edges with probability p. */
export function applyEdgeNoise(lat: PlanarLattice, p: number, rng: RNG) {
  const L = lat.L;
  const H = lat.H;

  // horizontal edges
  // horizontal edges: y in [0..H]
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x < L; x++) {
      if (rng.nextFloat() < p) lat.toggleEdge({ kind: "h", x, y });
    }
  }

// vertical edges: x in [0..L]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x <= L; x++) {
      if (rng.nextFloat() < p) lat.toggleEdge({ kind: "v", x, y });
    }
  }
}