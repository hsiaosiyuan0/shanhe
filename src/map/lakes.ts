import type { FeatureCollection, Point } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import { lakeCatalog, lakeSource } from '../../shared/lakes';

export const lakeSourceUrl = lakeSource.url;
export const lakes = lakeCatalog;
export const featuredLakes = ['Poyang Hu', 'Dongting Hu'].map((name) =>
  lakes.find((lake) => lake.name === name)!,
);
export const findLake = (id: string) => lakes.find((lake) => lake.id === id);
export const lakeDescription = (lake: (typeof lakes)[number]) =>
  `${lake.kind === 'Reservoir' ? '水库' : '湖泊'}水面 · 现代地理参考\n\n这里显示 Natural Earth 收录的概略水面轮廓。湖面会随季节、水位和年代变化，不能当作实时水域或故事年代的湖岸线。\n\n来源：Natural Earth · Lakes + Reservoirs · 1:10m\n${lakeSourceUrl}`;
export function lakeLabels(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: lakes
      .filter((lake) => lake.label)
      .map((lake) => ({
        type: 'Feature',
        id: lake.id,
        properties: {
          source_id: lake.id,
          label: lake.label,
          labelZoom: lake.labelZoom,
          priority: lake.priority,
        },
        geometry: { type: 'Point', coordinates: lake.center },
      })),
  };
}
export function lakeWaterLayers(): LayerSpecification[] {
  return [
    {
      id: 'lakes-fill',
      type: 'fill',
      source: 'lakes',
      paint: { 'fill-color': '#afd1d4', 'fill-opacity': 0.94 },
    },
    {
      id: 'lakes-shore',
      type: 'line',
      source: 'lakes',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#5892a3',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 7, 1, 12, 1.5],
        'line-opacity': 0.85,
      },
    },
    {
      id: 'lakes-hover',
      type: 'fill',
      source: 'lakes',
      filter: ['==', ['get', 'source_id'], ''],
      paint: { 'fill-color': '#438ba2', 'fill-opacity': 0.2 },
    },
  ];
}
export function lakeNameLayers(): LayerSpecification[] {
  // Separate integer/fractional thresholds keep zoom filters compatible with the style spec.
  return [...new Set(lakes.filter((l) => l.label).map((l) => l.labelZoom))]
    .sort((a, b) => a - b)
    .map((minzoom) => ({
      id: `lake-label-${minzoom}`,
      type: 'symbol',
      source: 'lake-labels',
      minzoom,
      filter: ['==', ['get', 'labelZoom'], minzoom],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Songti SC', 'STSong'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 13, 7, 16, 11, 18],
        'text-letter-spacing': 0.12,
        'text-max-width': 8,
        'text-padding': 8,
        'symbol-sort-key': ['case', ['get', 'priority'], 0, 1],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#215d75',
        'text-halo-color': '#eff8f5',
        'text-halo-width': 1.7,
        'text-halo-blur': 0.3,
      },
    }));
}
export const lakeLayerIds = [...lakeWaterLayers(), ...lakeNameLayers()].map((layer) => layer.id);
export const lakeHitLayerIds = ['lakes-fill', ...lakeNameLayers().map((layer) => layer.id)];
