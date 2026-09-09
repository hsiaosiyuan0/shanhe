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
  | 'id'
  | 'label'
  | 'kind'
  | 'coverage'
  | 'sourceId'
  | 'polygonSource'
  | 'aliases'
  | 'nameEvidence'
  | 'nameStatus'
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
          label: String(
            properties.label ||
              (properties.Lake_type === 2 ? '水库（名称待补充）' : '水面（名称待补充）'),
          ),
          kind: properties.Lake_type === 2 ? 'Reservoir' : 'Lake',
          coverage: 'source-record',
          polygonSource: String(properties.Poly_src ?? ''),
          nameStatus: 'missing',
        }
      : undefined)
  );
};
export const lakeDescription = (lake: LakeInfo) => {
  const aliases = (lake.aliases ?? []).filter(
    (n) => /[\u3400-\u9fff]/.test(n) && !n.endsWith(' · 库区'),
  );
  return [
    `${lake.kind === 'Reservoir' ? '水库' : '湖泊'} · 现代地理参考`,
    aliases.length ? `其他名称：${aliases.slice(0, 3).join('、')}` : '',
    lake.nameStatus === 'missing' ? '已接入资料尚未确认这片水面的名称。' : '',
    lake.nameStatus === 'dam-associated'
      ? '资料收录了关联大坝名称；“库区”用于定位，不代表已确认湖泊名称。'
      : '',
    lake.coverage === 'partial'
      ? '此处仅为洞庭湖的局部水面，不代表东、南、西洞庭湖的完整范围。'
      : '',
    '静态水面轮廓，不代表当前水位或故事年代的湖岸。',
  ]
    .filter(Boolean)
    .join('\n\n');
};
export const lakeDetails = (lake: LakeInfo) => ({
  text: [
    ...(lake.nameEvidence ?? []).map(
      (e) =>
        `名称依据：${e.source} #${e.sourceId}\n原字段：${e.field} = ${e.value}\n匹配：${e.method === 'point-in-polygon' ? '地名点位于此水面内（未采用就近匹配）' : e.method === 'document-and-id' ? '地方资料与水库编号核对' : '数据源关联编号'}`,
    ),
    `轮廓：HydroLAKES v1.0 #${lake.sourceId}\n原始底图：${lake.polygonSource} · CC BY 4.0\n中国区域约 1:25 万，采集时间因要素而异。`,
  ].join('\n\n'),
  links: [
    ...(lake.nameEvidence ?? []).map((e) => ({ label: `${e.source} · 名称资料`, url: e.url })),
    { label: 'HydroLAKES · 轮廓资料', url: lakeSourceUrl },
  ],
});
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
