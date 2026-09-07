type Coordinate = [number, number];
export type SmoothRoute = { coordinates: Coordinate[]; anchorIndices: number[] };

const project = ([lng, lat]: Coordinate): Coordinate => [
  lng,
  (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI,
];
const unproject = ([x, y]: Coordinate): Coordinate => [
  x,
  (Math.atan(Math.exp((y * Math.PI) / 180)) * 360) / Math.PI - 90,
];
const distance = (a: Coordinate, b: Coordinate) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Render-only, bounded Hermite interpolation. The stored waypoints remain unchanged. */
export function smoothRoute(anchors: Coordinate[], steps = 24): SmoothRoute {
  if (!Number.isInteger(steps) || steps < 1 || steps > 128)
    throw new Error('Invalid curve resolution');
  if (anchors.length < 2)
    return { coordinates: anchors.map((p) => [...p]), anchorIndices: anchors.map((_, i) => i) };
  const points = anchors.map(project);
  // Unwrap the date line so a short crossing does not travel around the world.
  for (let i = 1; i < points.length; i++) {
    while (points[i][0] - points[i - 1][0] > 180) points[i][0] -= 360;
    while (points[i][0] - points[i - 1][0] < -180) points[i][0] += 360;
  }
  const tangents = points.map((p, i): Coordinate => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    const length = distance(before, after);
    if (length < 1e-9) return [0, 0];
    const limit =
      i === 0
        ? distance(p, after)
        : i === points.length - 1
          ? distance(before, p)
          : Math.min(distance(before, p), distance(p, after));
    const magnitude = Math.min(length * 0.5, limit * 0.65);
    return [
      ((after[0] - before[0]) / length) * magnitude,
      ((after[1] - before[1]) / length) * magnitude,
    ];
  });
  const coordinates: Coordinate[] = [[...anchors[0]]];
  const anchorIndices = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      ta = tangents[i],
      tb = tangents[i + 1];
    for (let j = 1; j <= steps; j++) {
      const t = j / steps,
        t2 = t * t,
        t3 = t2 * t;
      const p = unproject(
        [0, 1].map(
          (axis) =>
            (2 * t3 - 3 * t2 + 1) * a[axis] +
            (t3 - 2 * t2 + t) * ta[axis] +
            (-2 * t3 + 3 * t2) * b[axis] +
            (t3 - t2) * tb[axis],
        ) as Coordinate,
      );
      coordinates.push(j === steps ? [points[i + 1][0], anchors[i + 1][1]] : p);
    }
    anchorIndices.push(coordinates.length - 1);
  }
  return { coordinates, anchorIndices };
}

/** Slice the complete curve, never re-smooth a prefix (which would change earlier bends). */
export function routeThroughAnchor(route: SmoothRoute, index: number): Coordinate[] {
  if (index < 1 || index >= route.anchorIndices.length) return [];
  return route.coordinates.slice(0, route.anchorIndices[index] + 1);
}
