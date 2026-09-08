import type {
  ExpressionSpecification,
  LayerSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import type { AdminLevel } from './adminPackage';

export const adminSourceIds = [
  'admin-areas',
  'admin-borders',
  'admin-references',
  'admin-labels',
] as const;
export const cityBoundaryMinZoom = 6;
export const countyBoundaryMinZoom = 9;
export type AdminLevelMode = 'auto' | AdminLevel;
export const adminLevelAtZoom = (zoom: number): AdminLevel =>
  zoom < cityBoundaryMinZoom ? 4 : zoom < countyBoundaryMinZoom ? 5 : 6;
export const resolveAdminLevel = (mode: AdminLevelMode, zoom: number): AdminLevel =>
  mode === 'auto' ? adminLevelAtZoom(zoom) : mode;
export const adminLevelName = (level: AdminLevel) => ({ 4: '省级', 5: '市级', 6: '区县' })[level];
export const placeLayerIds = ['admin-labels', 'modern-town-label'];
export const townSourceId = 'modern-town-detail';
export const townSource: VectorSourceSpecification = {
  type: 'vector',
  url: 'https://tiles.openfreemap.org/planet',
  attribution:
    '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
};
export function modernPlaceName(properties: Record<string, unknown>) {
  return ['name:zh-Hans', 'name:zh', 'name']
    .map((key) => properties[key])
    .find((value) => typeof value === 'string' && value.trim()) as string | undefined;
}
export function modernPlaceKind(properties: Record<string, unknown>) {
  return properties.level
    ? `${adminLevelName(Number(properties.level) as AdminLevel)}名称`
    : '乡镇 / 街区地名';
}
const hovered: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
export function modernAdminLayers(): LayerSpecification[] {
  return [
    {
      id: 'admin-area-fill',
      type: 'fill',
      source: 'admin-areas',
      paint: {
        'fill-color': '#846280',
        'fill-opacity': ['case', hovered, 0.12, 0],
        'fill-antialias': false,
      },
    },
    {
      id: 'admin-border-casing',
      type: 'line',
      source: 'admin-borders',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#fff9ee', 'line-width': 2.6, 'line-opacity': 0.75 },
    },
    {
      id: 'admin-border-line',
      type: 'line',
      source: 'admin-borders',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#79657c', 'line-width': 1.2, 'line-opacity': 0.85 },
    },
    {
      id: 'admin-reference-line',
      type: 'line',
      source: 'admin-references',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#79657c', 'line-width': 1.2, 'line-opacity': 0.85 },
    },
    {
      id: 'admin-hover-casing',
      type: 'line',
      source: 'admin-areas',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#fff9ee',
        'line-width': 5,
        'line-opacity': ['case', hovered, 0.95, 0],
      },
    },
    {
      id: 'admin-hover-outline',
      type: 'line',
      source: 'admin-areas',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#68456b',
        'line-width': 2.5,
        'line-opacity': ['case', hovered, 1, 0],
      },
    },
    {
      id: 'admin-labels',
      type: 'symbol',
      source: 'admin-labels',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Songti SC', 'STSong'],
        'text-size': 14,
        'text-padding': 14,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#52634f',
        'text-halo-color': '#fffdf1',
        'text-halo-width': 2,
        'text-halo-blur': 0.35,
      },
    },
  ].map((layer) => ({
    ...layer,
    layout: { ...layer.layout, visibility: 'none' },
  })) as LayerSpecification[];
}
// This supplemental OSM source supplies only town names; no administrative borders or polygons.
export const townLayer: LayerSpecification = {
  id: 'modern-town-label',
  type: 'symbol',
  source: townSourceId,
  'source-layer': 'place',
  minzoom: 11,
  filter: [
    'all',
    ['!=', ['to-number', ['get', 'capital'], 0], 6],
    [
      'match',
      ['get', 'class'],
      ['town', 'village', 'suburb', 'quarter', 'neighbourhood'],
      true,
      false,
    ],
  ],
  layout: {
    'text-field': [
      'case',
      ['!=', ['coalesce', ['get', 'name:zh-Hans'], ''], ''],
      ['get', 'name:zh-Hans'],
      ['!=', ['coalesce', ['get', 'name:zh'], ''], ''],
      ['get', 'name:zh'],
      ['coalesce', ['get', 'name'], ''],
    ],
    'text-font': ['Songti SC', 'STSong'],
    'text-size': 12,
    'text-padding': 12,
    'text-allow-overlap': false,
  },
  paint: { 'text-color': '#727566', 'text-halo-color': '#fffdf1', 'text-halo-width': 2 },
};
