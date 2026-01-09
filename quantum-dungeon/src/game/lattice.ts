// src/game/lattice.ts
// Planar (non-wrap) "surface-code-like" lattice model.
// Data qubits live on edges of an LxH grid of plaquettes.
// X-errors live on edges; Z-plaquette stabilizers (faces) detect them via parity.

export type Face = { fx: number; fy: number };

export type Edge =
  | { kind: "h"; x: number; y: number } // horizontal edge between vertices (x,y)-(x+1,y)
  | { kind: "v"; x: number; y: number }; // vertical edge between vertices (x,y)-(x,y+1)

/**
 * Planar conventions:
 * - Face grid: L faces in x, H faces in y (NO periodic wrap).
 * - Horizontal edges exist for:
 *      x in [0..L-1], y in [0..H]     (H+1 rows)
 * - Vertical edges exist for:
 *      x in [0..L],   y in [0..H-1]   (L+1 cols)
 *
 * Each face (fx,fy) has boundary edges:
 *  top:    h(fx, fy)
 *  bottom: h(fx, fy+1)
 *  left:   v(fx, fy)
 *  right:  v(fx+1, fy)
 *
 * On the boundary, missing edges are treated as 0 (no error).
 */
export class PlanarLattice {
  readonly L: number;
  readonly H: number;

  // error bits on edges
  private hErr: Uint8Array; // size L*(H+1)
  private vErr: Uint8Array; // size (L+1)*H

  constructor(L: number, H: number) {
    if (L < 3 || H < 3) throw new Error("Use L,H >= 3");
    this.L = L;
    this.H = H;

    this.hErr = new Uint8Array(L * (H + 1));
    this.vErr = new Uint8Array((L + 1) * H);
  }

  reset() {
    this.hErr.fill(0);
    this.vErr.fill(0);
  }

  private inFaceBounds(f: Face): boolean {
    return f.fx >= 0 && f.fx < this.L && f.fy >= 0 && f.fy < this.H;
  }

  private inHEdgeBounds(x: number, y: number): boolean {
    // h edges: x in [0..L-1], y in [0..H]
    return x >= 0 && x < this.L && y >= 0 && y <= this.H;
  }

  private inVEdgeBounds(x: number, y: number): boolean {
    // v edges: x in [0..L], y in [0..H-1]
    return x >= 0 && x <= this.L && y >= 0 && y < this.H;
  }

  private hIdx(x: number, y: number): number {
    // y in [0..H], x in [0..L-1]
    return y * this.L + x;
  }

  private vIdx(x: number, y: number): number {
    // y in [0..H-1], x in [0..L]
    return y * (this.L + 1) + x;
  }

  /** Toggle an X-error on an edge (this is both "noise" and "correction"). */
  toggleEdge(e: Edge) {
    if (e.kind === "h") {
      if (!this.inHEdgeBounds(e.x, e.y)) return; // outside board -> ignore
      this.hErr[this.hIdx(e.x, e.y)] ^= 1;
    } else {
      if (!this.inVEdgeBounds(e.x, e.y)) return; // outside board -> ignore
      this.vErr[this.vIdx(e.x, e.y)] ^= 1;
    }
  }

  /** Read error bit on an edge. Missing boundary edges are treated as 0. */
  getEdge(e: Edge): 0 | 1 {
    if (e.kind === "h") {
      if (!this.inHEdgeBounds(e.x, e.y)) return 0;
      return this.hErr[this.hIdx(e.x, e.y)] as 0 | 1;
    } else {
      if (!this.inVEdgeBounds(e.x, e.y)) return 0;
      return this.vErr[this.vIdx(e.x, e.y)] as 0 | 1;
    }
  }

  toggleRandomEdgeAt(x: number, y: number, isH: boolean) {
  this.toggleEdge(isH ? { kind: "h", x, y } : { kind: "v", x, y });}
  

  /** Face syndrome = parity of the 4 boundary edges of the face. */
  faceSyndrome(f: Face): 0 | 1 {
    if (!this.inFaceBounds(f)) return 0;

    const fx = f.fx;
    const fy = f.fy;

    const top = this.getEdge({ kind: "h", x: fx, y: fy });
    const bottom = this.getEdge({ kind: "h", x: fx, y: fy + 1 });
    const left = this.getEdge({ kind: "v", x: fx, y: fy });
    const right = this.getEdge({ kind: "v", x: fx + 1, y: fy });

    return (top ^ bottom ^ left ^ right) as 0 | 1;
  }

  /** Return all current defect faces (syndrome=1). */
  listDefects(): Face[] {
    const out: Face[] = [];
    for (let fy = 0; fy < this.H; fy++) {
      for (let fx = 0; fx < this.L; fx++) {
        if (this.faceSyndrome({ fx, fy }) === 1) out.push({ fx, fy });
      }
    }
    return out;
  }

  /**
   * Apply a correction step on the dual lattice between two faces.
   * Planar: no wrap. If step would go out of bounds, we ignore it.
   */
  applyDualStep(from: Face, to: Face) {
    // Only allow Manhattan neighbors
    const dx = to.fx - from.fx;
    const dy = to.fy - from.fy;

    const manhattan = Math.abs(dx) + Math.abs(dy);
    if (manhattan !== 1) throw new Error("applyDualStep: not a Manhattan neighbor");

    // If either endpoint is out of bounds, ignore the step (no wrap-around)
    if (!this.inFaceBounds(from) || !this.inFaceBounds(to)) return;

    const fx = from.fx;
    const fy = from.fy;

    if (dx === 1) {
      // moving right crosses the right edge of 'from': v(fx+1, fy)
      this.toggleEdge({ kind: "v", x: fx + 1, y: fy });
    } else if (dx === -1) {
      // moving left crosses the left edge of 'from': v(fx, fy)
      this.toggleEdge({ kind: "v", x: fx, y: fy });
    } else if (dy === 1) {
      // moving down crosses bottom edge: h(fx, fy+1)
      this.toggleEdge({ kind: "h", x: fx, y: fy + 1 });
    } else if (dy === -1) {
      // moving up crosses top edge: h(fx, fy)
      this.toggleEdge({ kind: "h", x: fx, y: fy });
    }
  }

  /**
   * Planar mode: we disable toric winding checks.
   * We'll implement a proper planar logical operator condition later (with boundaries).
   */
  logicalParity(): { wrapX: 0 | 1; wrapY: 0 | 1 } {
    return { wrapX: 0, wrapY: 0 };
  }
}