import { z } from 'zod';

export const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]);
export const sourceSchema = z.object({
  title: z.string().max(200),
  url: z.url().refine((v) => /^https?:\/\//.test(v), '只接受 http(s) 来源链接'),
});
export const eventSchema = z.object({
  id: z.string().min(1).max(100),
  year: z.number().int().min(-10000).max(10000),
  title: z.string().min(1).max(100),
  place: z.string().min(1).max(100),
  coordinates: coordinate,
  description: z.string().max(4000),
  category: z.enum(['life', 'career', 'travel', 'turning', 'culture']),
  quote: z.string().max(500).optional(),
  source: sourceSchema.optional(),
  confidence: z.enum(['reference', 'approximate', 'unverified']).default('unverified'),
});
export const markerSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  coordinates: coordinate,
  description: z.string().max(2000),
  kind: z.enum(['place', 'mountain', 'river', 'note']),
  source: sourceSchema.optional(),
  confidence: z.enum(['reference', 'approximate', 'unverified']).default('unverified'),
});
export const journeySchema = z.object({
  startYear: z.number().int().min(-10000).max(10000),
  endYear: z.number().int().min(-10000).max(10000),
  fromEventId: z.string().max(100).optional(),
  toEventId: z.string().max(100).optional(),
  summary: z.string().max(3000),
  status: z.enum(['reconstructed', 'unverified']),
  sources: z.array(sourceSchema).max(10),
  stops: z
    .array(
      z.object({
        at: z.number().int().nonnegative(),
        label: z.string().min(1).max(100),
        evidence: z.enum(['referenced', 'inferred', 'unknown']),
        note: z.string().max(1000),
      }),
    )
    .min(2)
    .max(500),
  legs: z
    .array(
      z.object({
        from: z.number().int().nonnegative(),
        to: z.number().int().positive(),
        label: z.string().min(1).max(100),
        mode: z.enum(['land', 'water', 'unknown']),
        evidence: z.enum(['referenced', 'inferred', 'unknown']),
        note: z.string().max(2000),
      }),
    )
    .min(1)
    .max(50),
});
export const routeSchema = z
  .object({
    id: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    coordinates: z.array(coordinate).min(2).max(500),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#ad795a'),
    approximate: z.literal(true).default(true),
    journey: journeySchema
      .optional()
      .describe(
        'A dated itinerary, with transport modes, cited waypoints and uncertain legs. Without this object the route is only a connection diagram, never an actual historical journey. Coordinate indices refer to this route coordinates array. Geometry remains approximate.',
      ),
  })
  .superRefine((route, ctx) => {
    const j = route.journey;
    if (!j) return;
    const last = route.coordinates.length - 1;
    if (j.endYear < j.startYear)
      ctx.addIssue({
        code: 'custom',
        message: '行程结束年份不能早于出发年份',
        path: ['journey', 'endYear'],
      });
    if (j.stops.some((s, i) => s.at > last || (i > 0 && s.at <= j.stops[i - 1].at)))
      ctx.addIssue({
        code: 'custom',
        message: '行程地点索引须按顺序排列且位于路线坐标范围内',
        path: ['journey', 'stops'],
      });
    if (
      j.legs[0]?.from !== 0 ||
      j.legs.at(-1)?.to !== last ||
      j.legs.some((l, i) => l.to <= l.from || l.to > last || (i > 0 && l.from !== j.legs[i - 1].to))
    )
      ctx.addIssue({
        code: 'custom',
        message: '行程分段须连续覆盖全部路线；未知路段请显式标为 unknown',
        path: ['journey', 'legs'],
      });
  });
export const layersSchema = z.object({
  elevation: z
    .boolean()
    .default(true)
    .describe('Color terrain by real elevation, with hillshade; independent of the 3D camera.'),
  admin: z
    .boolean()
    .default(false)
    .describe(
      'Overlay modern province boundaries and labels. Currently mainland China; never historical borders.',
    ),
  terrain: z.boolean(),
  rivers: z.boolean(),
  mountains: z.boolean(),
  routes: z.boolean(),
  connections: z
    .boolean()
    .default(false)
    .describe(
      'Show schematic links between life events. Off by default for history; links do not establish a traveled route.',
    ),
});
export const viewSchema = z.object({
  center: coordinate,
  zoom: z.number().min(1).max(16),
  pitch: z.number().min(0).max(65),
});
export const storySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(80),
  subtitle: z.string().max(240),
  kind: z.enum(['history', 'biography', 'travel']),
  era: z.string().max(100),
  description: z.string().max(4000),
  events: z.array(eventSchema).max(500),
  markers: z.array(markerSchema).max(500),
  routes: z.array(routeSchema).max(100),
  layers: layersSchema,
  view: viewSchema,
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_event'), event: eventSchema }),
  z.object({ type: z.literal('add_marker'), marker: markerSchema }),
  z.object({ type: z.literal('add_route'), route: routeSchema }),
  z.object({ type: z.literal('set_view'), view: viewSchema }),
  z.object({ type: z.literal('set_layers'), layers: layersSchema }),
]);
export const actionsSchema = z.object({ actions: z.array(actionSchema).max(40) });
export type Story = z.infer<typeof storySchema>;
export type StoryEvent = z.infer<typeof eventSchema>;
export type MapMarker = z.infer<typeof markerSchema>;
export type MapRoute = z.infer<typeof routeSchema>;
export type MapAction = z.infer<typeof actionSchema>;
export type Layers = z.infer<typeof layersSchema>;
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: MapAction[];
  createdAt: string;
  mode: 'demo' | 'live';
};
export type Snapshot = { id: string; name: string; createdAt: string };
export type StoryDetail = { story: Story; messages: Message[]; snapshots: Snapshot[] };
export type Settings = { baseUrl: string; model: string; hasKey: boolean; mode: 'demo' | 'live' };

export function applyActions(original: Story, input: unknown): Story {
  const { actions } = actionsSchema.parse(input);
  const story = structuredClone(original);
  for (const action of actions) {
    if (action.type === 'add_event') {
      if (story.events.some((e) => e.id === action.event.id)) throw new Error('事件 ID 已存在');
      story.events.push(action.event);
      story.events.sort((a, b) => a.year - b.year);
    } else if (action.type === 'add_marker') {
      if (story.markers.some((m) => m.id === action.marker.id)) throw new Error('标记 ID 已存在');
      story.markers.push(action.marker);
    } else if (action.type === 'add_route') {
      if (story.routes.some((r) => r.id === action.route.id)) throw new Error('路线 ID 已存在');
      story.routes.push(action.route);
    } else if (action.type === 'set_layers') story.layers = action.layers;
    else if (action.type === 'set_view') story.view = action.view;
  }
  return storySchema.parse(story);
}
