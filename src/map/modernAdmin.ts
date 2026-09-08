import type {
  ExpressionSpecification,
  LayerSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';

export const modernAdminSourceId = 'modern-admin-detail';
export const boundaryOverviewSourceId = 'modern-admin-boundary-overview';
export const cityBoundaryMinZoom = 7;
export const countyBoundaryMinZoom = 8;
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
  if (zoom < cityBoundaryMinZoom) return '城市地名 · 放大显示市县界';
  if (zoom < countyBoundaryMinZoom) return '省 / 市界 · 放大显示区县界';
  if (zoom < 11) return '省 / 市 / 区县界';
  return '区县界 / 乡镇地名';
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
    overview = false,
    casing = false,
  ): LayerSpecification => ({
    id: casing ? `${id}-casing` : id,
    type: 'line',
    source: overview ? boundaryOverviewSourceId : modernAdminSourceId,
    ...(!overview && { 'source-layer': 'boundary' }),
    minzoom,
    ...(overview && { maxzoom: 9 }),
    filter: ['all', ['==', ['get', 'admin_level'], level], ['!=', ['get', 'maritime'], 1]],
    layout: { visibility: 'none', 'line-join': 'round' },
    paint: {
      'line-color': casing ? '#fff8e9' : level === 6 ? '#7b617b' : '#68456b',
      'line-width': casing ? width + (level === 6 ? 1.2 : 1.8) : width,
      'line-opacity': casing ? 0.78 : 0.95,
      ...(!casing &&
        level !== 6 && {
          'line-dasharray': level === 4 ? [6, 2] : [3, 1.7],
        }),
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
  const borders = [
    ['modern-county-overview', 6, countyBoundaryMinZoom, 1.15, true],
    ['modern-city-overview', 5, cityBoundaryMinZoom, 2, true],
    ['modern-province-overview', 4, cityBoundaryMinZoom, 2.4, true],
    ['modern-county-boundary', 6, 9, 1.15, false],
    ['modern-city-boundary', 5, 9, 2, false],
    ['modern-province-boundary', 4, 6, 2.4, false],
  ] as const;
  return [
    ...borders.map(([id, level, zoom, width, overview]) =>
      boundary(id, level, zoom, width, overview, true),
    ),
    ...borders.map(([id, level, zoom, width, overview]) =>
      boundary(id, level, zoom, width, overview),
    ),
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
