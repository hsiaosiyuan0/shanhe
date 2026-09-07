import type { FeatureCollection, MultiLineString, LineString, Point } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import { riverLines, type RiverChannel } from '../../shared/rivers';

export function customRiverFeatures(
  rivers: RiverChannel[],
): FeatureCollection<LineString | MultiLineString> {
  return {
    type: 'FeatureCollection',
    features: rivers
      .filter((r) => r.visible)
      .map((r) => ({
        type: 'Feature',
        id: r.id,
        properties: { id: r.id, label: r.label, color: r.color, period: r.period },
        geometry: r.geometry,
      })),
  };
}
export function customRiverLabels(rivers: RiverChannel[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: rivers
      .filter((r) => r.visible)
      .map((r) => {
        const longest = riverLines(r.geometry).reduce((a, b) => (a.length >= b.length ? a : b));
        return {
          type: 'Feature',
          properties: {
            id: r.id,
            label:
              r.label +
              (r.period === 'historical'
                ? ` · ${r.periodLabel || '历史河道'}`
                : r.period === 'unknown'
                  ? ' · 年代待定'
                  : ''),
            color: r.color,
          },
          geometry: { type: 'Point', coordinates: longest[Math.floor(longest.length / 2)] },
        };
      }),
  };
}
export function customRiverLayers(): LayerSpecification[] {
  return [
    {
      id: 'custom-river-hover',
      type: 'line',
      source: 'custom-rivers',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': ['get', 'color'], 'line-width': 15, 'line-opacity': 0.22 },
    },
    {
      id: 'custom-river-halo',
      type: 'line',
      source: 'custom-rivers',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fff9e9', 'line-width': 5.5, 'line-opacity': 0.8 },
    },
    {
      id: 'custom-river-line',
      type: 'line',
      source: 'custom-rivers',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.6, 6, 2.8, 10, 4.5],
      },
    },
    {
      id: 'custom-river-hit',
      type: 'line',
      source: 'custom-rivers',
      paint: { 'line-width': 16, 'line-opacity': 0 },
    },
    {
      id: 'custom-river-label',
      type: 'symbol',
      source: 'custom-river-labels',
      layout: {
        'symbol-placement': 'point',
        'text-field': ['get', 'label'],
        'text-font': ['Songti SC', 'STSong'],
        'text-size': 15,
        'text-letter-spacing': 0.15,
        'text-offset': [0, -0.85],
        'text-padding': 10,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#fffdf0', 'text-halo-width': 2 },
    },
  ];
}
