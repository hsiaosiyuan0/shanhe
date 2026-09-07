/** Shared by the DEM color ramp and the visible legend; heights are in metres. */
export const elevationStops: [number, string][] = [
  [0, '#c9d8b3'],
  [200, '#b3c797'],
  [500, '#d7d1a0'],
  [1000, '#d9bd8c'],
  [2000, '#c29675'],
  [3500, '#a58473'],
  [5000, '#c6bcab'],
  [6500, '#f0eee5'],
];
export const elevationGradient = `linear-gradient(to right, ${elevationStops.map(([, color]) => color).join(', ')})`;
