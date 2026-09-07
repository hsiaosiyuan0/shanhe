import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';

export type MajorRiver = {
  id: string;
  label: string;
  names: string[];
  aliases: string[];
  color: string;
  center: [number, number];
  description?: string;
  labelAtCenter?: boolean;
};

export const majorRivers: MajorRiver[] = [
  {
    id: 'yangtze',
    label: '长江',
    names: ['Tuotuo', 'Tongtian', 'Jinsha', 'Chang Jiang', 'Yangtze'],
    aliases: ['长江', '长江干流', '扬子江', '沱沱河', '通天河', '金沙江'],
    color: '#287e98',
    center: [114.288456, 30.572088] as [number, number],
  },
  {
    id: 'yellow',
    label: '黄河',
    names: ['Huang'],
    aliases: ['黄河', '黄河干流', 'Yellow River'],
    color: '#9a6d2a',
    center: [110.458715, 35.343166] as [number, number],
  },
  {
    id: 'huai',
    label: '淮河',
    names: ['Huai', 'Hudi'],
    aliases: ['淮河', '淮水', '淮河干流', 'Huai River'],
    color: '#786093',
    center: [117.116222, 32.837755],
    labelAtCenter: true,
    description:
      '地域称谓中的「淮南」「淮北」，以淮河的南北方位为参照，具体范围随语境与年代而变，不等同于今天的淮南市、淮北市。\n\n图上补入淮河干流及经洪泽湖向长江汇流的现代河段，湖区采用湖泊中心线；未完整收录入海分流。',
  },
];

const segmentNames: Record<string, string> = {
  Tuotuo: '沱沱河',
  Tongtian: '通天河',
  Jinsha: '金沙江',
};

export function riverSegmentName(name: string): string {
  return segmentNames[name] ?? findMajorRiver(name)?.label ?? name;
}

export function findMajorRiver(name: string): MajorRiver | undefined {
  const normalized = name.replaceAll(/\s/g, '').toLowerCase();
  return majorRivers.find((river) =>
    [...river.names, ...river.aliases].some(
      (alias) => alias.replaceAll(/\s/g, '').toLowerCase() === normalized,
    ),
  );
}

export function riverFilter(rivers = majorRivers): FilterSpecification {
  return ['in', ['get', 'name'], ['literal', rivers.flatMap((river) => river.names)]];
}

/** Keep short, meandering rivers readable with a name anchored on the actual channel. */
export function riverLabelAnchors(): FeatureCollection<Point, { name: string }> {
  return {
    type: 'FeatureCollection',
    features: majorRivers
      .filter((river) => river.labelAtCenter)
      .map((river) => ({
        type: 'Feature',
        properties: { name: river.names[0] },
        geometry: { type: 'Point', coordinates: river.center },
      })),
  };
}

/** Follow the bundled river geometry without straightening or inventing connections. */
export function majorRiverLayers(): LayerSpecification[] {
  const color: ExpressionSpecification = [
    'match',
    ['get', 'name'],
    majorRivers[0].names,
    majorRivers[0].color,
    ...majorRivers.slice(1).flatMap((river) => [river.names, river.color]),
    '#287e98',
  ];
  const [firstName, ...otherNames] = majorRivers.flatMap((river) => river.names);
  const label: ExpressionSpecification = [
    'match',
    ['get', 'name'],
    firstName,
    riverSegmentName(firstName),
    ...otherNames.flatMap((name) => [name, riverSegmentName(name)]),
    ['get', 'name'],
  ];
  const common = { source: 'rivers', filter: riverFilter() };
  const layers: LayerSpecification[] = [
    {
      ...common,
      id: 'major-river-hover',
      type: 'line',
      filter: riverFilter([]),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': 14, 'line-opacity': 0.2 },
    },
    {
      ...common,
      id: 'major-river-halo',
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#fff9e9',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 6, 5.5, 10, 8],
        'line-opacity': 0.7,
      },
    },
    {
      ...common,
      id: 'major-river-line',
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 6, 3, 10, 5],
        'line-opacity': 0.95,
      },
    },
    {
      ...common,
      id: 'major-river-hit',
      type: 'line',
      paint: { 'line-width': 16, 'line-opacity': 0 },
    },
    {
      ...common,
      id: 'major-river-label',
      type: 'symbol',
      filter: riverFilter(majorRivers.filter((river) => !river.labelAtCenter)),
      layout: {
        'symbol-placement': 'line-center',
        'text-field': label,
        'text-font': ['Songti SC', 'STSong'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 13, 6, 16, 10, 18],
        'text-letter-spacing': 0.3,
        'text-max-angle': 180,
        'text-allow-overlap': true,
        'text-keep-upright': true,
        'text-padding': 14,
        'text-offset': [0, -0.45],
      },
      paint: {
        'text-color': color,
        'text-halo-color': '#fffdf0',
        'text-halo-width': 2,
        'text-halo-blur': 0.6,
      },
    },
  ];
  const lineLabel = layers.at(-1)!;
  if (lineLabel.type === 'symbol') {
    layers.push({
      ...lineLabel,
      id: 'major-river-anchor-label',
      source: 'river-labels',
      filter: riverFilter(),
      layout: {
        ...lineLabel.layout,
        'symbol-placement': 'point',
        'text-offset': [0, -0.8],
      },
    });
  }
  return layers;
}
