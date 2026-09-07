import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';

export const majorRivers = [
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
];
export type MajorRiver = (typeof majorRivers)[number];

export function riverSegmentName(name: string): string {
  const names: Record<string, string> = {
    Tuotuo: '沱沱河',
    Tongtian: '通天河',
    Jinsha: '金沙江',
    Huang: '黄河',
  };
  return names[name] ?? '长江';
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

/** Follow the bundled river geometry without straightening or inventing connections. */
export function majorRiverLayers(): LayerSpecification[] {
  const color: ExpressionSpecification = [
    'match',
    ['get', 'name'],
    'Huang',
    majorRivers[1].color,
    majorRivers[0].color,
  ];
  const common = { source: 'rivers', filter: riverFilter() };
  return [
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
      layout: {
        'symbol-placement': 'line-center',
        'text-field': [
          'match',
          ['get', 'name'],
          'Huang',
          '黄河',
          'Tuotuo',
          '沱沱河',
          'Tongtian',
          '通天河',
          'Jinsha',
          '金沙江',
          '长江',
        ],
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
}
