import type { FeatureCollection, Point } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import { lakeCatalog, lakeSource } from '../../shared/lakes';

export const lakeSourceUrl = lakeSource.url;
export const lakes = lakeCatalog;
export const featuredLakes = ['hydrolakes:151', 'hydrolakes:1470'].map((id) =>
  lakes.find((lake) => lake.id === id)!,
);
export const findLake = (id: string) => lakes.find((lake) => lake.id === id);
type LakeInfo = Pick<
  (typeof lakes)[number],
  'id' | 'label' | 'kind' | 'coverage' | 'sourceId' | 'polygonSource'
>;
export const lakeFeatureInfo = (
  properties: Record<string, unknown> | undefined,
): LakeInfo | undefined => {
  const id = String(properties?.source_id ?? '');
  return (
    findLake(id) ??
    (typeof properties?.Hylak_id === 'number'
      ? {
          id,
          sourceId: properties.Hylak_id,
          label: String(properties.label || '未命名湖泊 / 水库'),
          kind: properties.Lake_type === 2 ? 'Reservoir' : 'Lake',
          coverage: 'source-record',
          polygonSource: String(properties.Poly_src ?? ''),
        }
      : undefined)
  );
};
export const lakeDescription = (lake: LakeInfo) =>
  `${lake.kind === 'Reservoir' ? '水库' : '湖泊'}水面 · 现代地理参考\n\n${lake.coverage === 'partial' ? '此处是 HydroLAKES 命名为 Dongting 的局部水面，不代表东、南、西洞庭湖的完整范围。周边水面按各自原始要素保留，未补画或连成全湖。\n\n' : ''}轮廓来自 HydroLAKES v1.0，保留源数据的湖岸和岛屿。中国区域约 1:25 万，采集时间因要素而异；不代表实时水位、丰枯水期或故事年代的湖岸。\n\n源要素：${lake.sourceId} · 原始底图：${lake.polygonSource}\n来源：HydroLAKES · CC BY 4.0\n${lakeSourceUrl}`;
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
          label: lake.coverage === 'partial' ? `${lake.label}（局部）` : lake.label,
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
