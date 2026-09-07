import type {
  ExpressionSpecification,
  LayerSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';

export const modernAdminSourceId = 'modern-admin-detail';
export const modernAdminSource: VectorSourceSpecification = {
  type: 'vector',
  url: 'https://tiles.openfreemap.org/planet',
  attribution:
    '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
};
export const adminDetailMinZoom = 5;
export const placeLayerIds = ['modern-city-label', 'modern-county-label', 'modern-town-label'];

export function adminScaleLabel(zoom: number) {
  if (zoom < 5) return '省级概览 · 放大查看市县';
  if (zoom < 8) return '省市对照 · 继续放大查看区县';
  if (zoom < 11) return '市 / 区县对照';
  return '区县 / 乡镇地名';
}
export function modernPlaceName(properties: Record<string, unknown>) {
  return ['name:zh-Hans', 'name:zh', 'name']
    .map((key) => properties[key])
    .find((value) => typeof value === 'string' && value.trim()) as string | undefined;
}
export function modernPlaceKind(properties: Record<string, unknown>) {
  if (Number(properties.capital) === 6) return '区县地名';
  if (properties.class === 'city') return '城市地名';
  return '乡镇 / 街区地名';
}
// Chinese OSM admin levels: province 4, prefecture 5, county/district 6.
// `class=city` also includes counties, so it cannot determine the tier alone.
const capital: ExpressionSpecification = ['to-number', ['get', 'capital'], 0];
const rank: ExpressionSpecification = ['to-number', ['get', 'rank'], 100];
const name: ExpressionSpecification = [
  'case',
  ['!=', ['coalesce', ['get', 'name:zh-Hans'], ''], ''],
  ['get', 'name:zh-Hans'],
  ['!=', ['coalesce', ['get', 'name:zh'], ''], ''],
  ['get', 'name:zh'],
  ['coalesce', ['get', 'name'], ''],
];

export function provinceLabelFeatures(
  regions: { name: string; center: [number, number] }[],
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: regions.map((region) => ({
      type: 'Feature',
      properties: { name: region.name },
      geometry: { type: 'Point', coordinates: region.center },
    })),
  };
}
export const provinceLabels: LayerSpecification = {
  id: 'province-labels',
  type: 'symbol',
  source: 'province-labels',
  layout: {
    visibility: 'none',
    'text-field': ['get', 'name'],
    'text-font': ['Songti SC', 'STSong'],
    'text-size': 15,
    'text-letter-spacing': 0.15,
    'text-padding': 18,
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#786779',
    'text-halo-color': '#fffdf1',
    'text-halo-width': 2,
    'text-opacity': 1,
  },
};

export function modernAdminLayers(): LayerSpecification[] {
  const boundary = (
    id: string,
    level: number,
    minzoom: number,
    width: number,
    opacity: number,
  ): LayerSpecification => ({
    id,
    type: 'line',
    source: modernAdminSourceId,
    'source-layer': 'boundary',
    minzoom,
    filter: ['all', ['==', ['get', 'admin_level'], level], ['!=', ['get', 'maritime'], 1]],
    layout: { visibility: 'none', 'line-join': 'round' },
    paint: {
      'line-color': '#85778b',
      'line-width': width,
      'line-opacity': opacity,
      'line-dasharray': level === 4 ? [5, 3] : level === 5 ? [3, 3] : [1.5, 3],
    },
  });
  const label = (
    id: string,
    minzoom: number,
    filter: ExpressionSpecification,
    size: number,
    color: string,
  ): LayerSpecification => ({
    id,
    type: 'symbol',
    source: modernAdminSourceId,
    'source-layer': 'place',
    minzoom,
    filter,
    layout: {
      visibility: 'none',
      'text-field': name,
      'text-font': ['Songti SC', 'STSong'],
      'text-size': ['interpolate', ['linear'], ['zoom'], minzoom, size, minzoom + 3, size + 2],
      'text-max-width': 9,
      'text-padding': id === 'modern-city-label' ? 20 : 12,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-sort-key': rank,
      'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.45,
    },
    paint: {
      'text-color': color,
      'text-halo-color': '#fffdf1',
      'text-halo-width': 2,
      'text-halo-blur': 0.35,
    },
  });
  return [
    boundary('modern-province-boundary', 4, 6, 1.6, 0.65),
    boundary('modern-city-boundary', 5, 6, 1.1, 0.65),
    boundary('modern-county-boundary', 6, 8, 0.85, 0.65),
    label(
      'modern-city-label',
      5,
      ['all', ['==', ['get', 'class'], 'city'], ['<', capital, 6]],
      14,
      '#465948',
    ),
    label('modern-county-label', 8, ['==', capital, 6], 13, '#596653'),
    label(
      'modern-town-label',
      11,
      [
        'all',
        ['!=', capital, 6],
        [
          'match',
          ['get', 'class'],
          ['town', 'village', 'suburb', 'quarter', 'neighbourhood'],
          true,
          false,
        ],
      ],
      12,
      '#727566',
    ),
  ];
}
