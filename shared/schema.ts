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
export const routeSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  coordinates: z.array(coordinate).min(2).max(500),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ad795a'),
  approximate: z.literal(true).default(true),
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
