type Point = { x: number; y: number };

/** Clip MVT buffers as open linework. Never close a clipped path along a tile
 * edge: doing so invents administrative borders and apparent enclaves. */
export function clipBoundaryLines(lines: Point[][], extent: number): Point[][] {
  const result: Point[][] = [];
  const seen = new Set<string>();
  const equal = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  for (const line of lines) {
    let current: Point[] | undefined;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      let start = 0,
        end = 1;
      const p = [-dx, dx, -dy, dy];
      const q = [a.x, extent - a.x, a.y, extent - a.y];
      for (let edge = 0; edge < 4; edge++) {
        if (p[edge] === 0) {
          if (q[edge] < 0) {
            end = -1;
            break;
          }
        } else {
          const t = q[edge] / p[edge];
          if (p[edge] < 0) start = Math.max(start, t);
          else end = Math.min(end, t);
        }
      }
      if (start >= end) {
        current = undefined;
        continue;
      }
      const point = (t: number) => ({
        x: Math.max(0, Math.min(extent, a.x + t * dx)),
        y: Math.max(0, Math.min(extent, a.y + t * dy)),
      });
      const from = point(start),
        to = point(end);
      // Shared tile-edge segments belong to the neighbour on the right/bottom.
      if (
        equal(from, to) ||
        (from.x === extent && to.x === extent) ||
        (from.y === extent && to.y === extent)
      ) {
        current = undefined;
        continue;
      }
      const key = [from, to].map((p) => `${p.x},${p.y}`).sort().join('|');
      if (seen.has(key)) {
        current = undefined;
        continue;
      }
      seen.add(key);
      if (current && equal(current[current.length - 1], from)) current.push(to);
      else {
        current = [from, to];
        result.push(current);
      }
      if (end < 1) current = undefined;
    }
  }
  return result;
}
