import { z } from 'zod';

// Keep multipart geometry intact: separate stretches must never be joined or smoothed.
const position = z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]);
const line = z
  .array(position)
  .min(2)
  .max(8000)
  .refine(
    (points) => points.some((p) => p[0] !== points[0][0] || p[1] !== points[0][1]),
    '河段至少需要两个不同的坐标',
  );
export const riverGeometrySchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('LineString'), coordinates: line }),
    z.object({ type: z.literal('MultiLineString'), coordinates: z.array(line).min(1).max(200) }),
  ])
  .refine(
    (g) => riverLines(g).reduce((n, part) => n + part.length, 0) <= 8000,
    '每条河道最多 8,000 个坐标点',
  );
export type RiverGeometry = z.infer<typeof riverGeometrySchema>;
export function riverLines(
  g:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'MultiLineString'; coordinates: [number, number][][] },
) {
  return g.type === 'LineString' ? [g.coordinates] : g.coordinates;
}
export const riverFields = z.object({
  label: z.string().trim().min(1).max(100),
  geometry: riverGeometrySchema.describe(
    'Actual WGS84 river geometry, never a smoothed travel route. Preserve gaps between parts.',
  ),
  description: z.string().max(2000).default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#287e98'),
  visible: z.boolean().default(true),
  period: z.enum(['modern', 'historical', 'unknown']).default('unknown'),
  periodLabel: z
    .string()
    .max(100)
    .default('')
    .describe(
      'Human-readable date or period of this dataset; historical geometry is not inferred from the story year.',
    ),
  source: z
    .object({ title: z.string().min(1).max(200), url: z.url().regex(/^https?:\/\//) })
    .optional(),
  confidence: z.enum(['approximate', 'unverified']).default('unverified'),
});
export const riverChannelSchema = riverFields.extend({ id: z.string().min(1).max(100) });
export const riverPatchSchema = z
  .object({
    label: riverFields.shape.label.optional(),
    geometry: riverGeometrySchema.optional(),
    description: riverFields.shape.description.removeDefault().optional(),
    color: riverFields.shape.color.removeDefault().optional(),
    visible: z.boolean().optional(),
    period: riverFields.shape.period.removeDefault().optional(),
    periodLabel: riverFields.shape.periodLabel.removeDefault().optional(),
    source: riverFields.shape.source.nullable(),
    confidence: riverFields.shape.confidence.removeDefault().optional(),
  })
  .strict();
export type RiverChannel = z.infer<typeof riverChannelSchema>;
export function riverSummary(river: RiverChannel) {
  const { geometry, ...metadata } = river;
  const parts = riverLines(geometry);
  const points = parts.flat();
  const bounds = points.reduce(
    (b, p) => [
      Math.min(b[0], p[0]),
      Math.min(b[1], p[1]),
      Math.max(b[2], p[0]),
      Math.max(b[3], p[1]),
    ],
    [180, 85, -180, -85],
  );
  return {
    ...metadata,
    geometryType: geometry.type,
    parts: parts.length,
    points: points.length,
    bounds,
  };
}

/** A single import represents one named river, possibly with disconnected parts. */
export function parseRiverGeoJSON(input: unknown): {
  geometry: RiverGeometry;
  properties: Record<string, unknown>;
} {
  const node = z.object({ type: z.string() }).passthrough().parse(input);
  if ('crs' in node) throw new Error('请先将文件转换为 WGS84 / EPSG:4326，并移除旧版 crs 字段');
  if (node.type === 'FeatureCollection') {
    const features = z
      .array(z.object({ type: z.literal('Feature') }).passthrough())
      .min(1)
      .max(200)
      .parse(node.features);
    const parsed = features.map(parseRiverGeoJSON);
    return {
      geometry: riverGeometrySchema.parse({
        type: 'MultiLineString',
        coordinates: parsed.flatMap((f) => riverLines(f.geometry)),
      }),
      properties: parsed[0].properties,
    };
  }
  if (node.type === 'Feature') {
    z.object({ type: z.enum(['LineString', 'MultiLineString']) }).parse(node.geometry);
    const geometry = parseRiverGeoJSON(node.geometry).geometry;
    return { geometry, properties: z.record(z.string(), z.unknown()).parse(node.properties ?? {}) };
  }
  return { geometry: riverGeometrySchema.parse(node), properties: {} };
}

export function exportRiverGeoJSON(river: RiverChannel) {
  const { geometry, ...properties } = river;
  return { type: 'Feature' as const, geometry, properties };
}
