import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

export type AdminArea = Omit<
  Feature<
    Polygon | MultiPolygon,
    {
      name: string;
      level: 5 | 6;
      osmId: number;
      sourceDate: string;
    }
  >,
  'id' | 'bbox'
> & { id: number; bbox: [number, number, number, number] };
type Coordinate = { lon: number; lat: number };
type Member = { type: string; role: string; geometry?: Coordinate[] };
type Relation = { type: string; id: number; tags?: Record<string, string>; members?: Member[] };
const key = (p: Position) => `${p[0]},${p[1]}`;
const municipalities = new Set(['北京市', '天津市', '上海市', '重庆市']);
const ringArea = (ring: Position[]) =>
  Math.abs(
    ring.reduce((sum, point, i) => {
      const next = ring[(i + 1) % ring.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0),
  );

/** Join real OSM member ways. An incomplete relation is rejected, never closed
 * with a guessed line. Multiple outer rings and inner exclusions are retained. */
function rings(members: Member[]): Position[][] | undefined {
  const paths: Position[][] = [];
  for (const member of members) {
    if (member.type !== 'way' || !member.geometry || member.geometry.length < 2) return;
    const path = member.geometry.map((p) => [p.lon, p.lat]);
    if (
      path.some(
        ([x, y]) =>
          !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90,
      )
    )
      return;
    paths.push(path);
  }
  const remaining = new Set(paths.map((_, i) => i));
  const ends = new Map<string, number[]>();
  paths.forEach((path, i) => {
    for (const p of [path[0], path[path.length - 1]])
      ends.set(key(p), [...(ends.get(key(p)) || []), i]);
  });
  const result: Position[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const ring = [...paths[first]];
    while (key(ring[0]) !== key(ring[ring.length - 1])) {
      const end = key(ring[ring.length - 1]);
      const candidates = [...new Set(ends.get(end))].filter((id) => remaining.has(id));
      if (candidates.length !== 1) return;
      const next = candidates[0];
      remaining.delete(next);
      const path = key(paths[next][0]) === end ? paths[next] : [...paths[next]].reverse();
      for (const p of path.slice(1)) ring.push(p);
    }
    if (ring.length < 4 || ringArea(ring) === 0) return;
    result.push(ring);
  }
  return result;
}

export function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i],
      [bx, by] = ring[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
export function areaContains(area: AdminArea, point: Position): boolean {
  const [w, s, e, n] = area.bbox;
  if (point[0] < w || point[0] > e || point[1] < s || point[1] > n) return false;
  const polygons =
    area.geometry.type === 'Polygon' ? [area.geometry.coordinates] : area.geometry.coordinates;
  return polygons.some(
    ([outer, ...holes]) =>
      pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)),
  );
}

export function decodeAdminAreas(data: unknown): AdminArea[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as any).elements))
    throw new Error('行政区轮廓数据无效');
  const input = data as {
    elements: Relation[];
    remark?: string;
    osm3s?: { timestamp_osm_base?: string };
  };
  if (input.remark) throw new Error('行政区轮廓服务繁忙，请稍后重试');
  const result: AdminArea[] = [];
  for (const relation of input.elements) {
    const tags = relation.tags || {};
    const name = tags['name:zh-Hans'] || tags['name:zh'] || tags.name;
    const level =
      municipalities.has(tags.name) && tags.admin_level === '4' ? 5 : Number(tags.admin_level);
    if (
      relation.type !== 'relation' ||
      !Number.isSafeInteger(relation.id) ||
      !name ||
      ![5, 6].includes(level) ||
      tags.boundary !== 'administrative' ||
      !relation.members
    )
      continue;
    const outer = rings(
      relation.members.filter((m) => m.role === 'outer' || (m.role === '' && m.type === 'way')),
    );
    const inner = rings(relation.members.filter((m) => m.role === 'inner'));
    if (!outer?.length || !inner) continue;
    // A nested island can have its own holes. Use its smallest enclosing ring.
    const polygons = outer.map((ring) => [ring]).sort((a, b) => ringArea(a[0]) - ringArea(b[0]));
    let valid = true;
    for (const hole of inner) {
      const owner = polygons.find((p) => pointInRing(hole[0], p[0]));
      if (!owner) {
        valid = false;
        break;
      }
      owner.push(hole);
    }
    if (!valid) continue;
    const bbox: AdminArea['bbox'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of outer)
      for (const [x, y] of ring) {
        bbox[0] = Math.min(bbox[0], x);
        bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x);
        bbox[3] = Math.max(bbox[3], y);
      }
    result.push({
      type: 'Feature',
      id: relation.id,
      bbox,
      properties: {
        name,
        level: level as 5 | 6,
        osmId: relation.id,
        sourceDate: input.osm3s?.timestamp_osm_base || '',
      },
      geometry:
        polygons.length === 1
          ? { type: 'Polygon', coordinates: polygons[0] }
          : { type: 'MultiPolygon', coordinates: polygons },
    });
  }
  return result;
}

export function adminAreaQuery([lng, lat]: Position): string {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85)
    throw new Error('行政区查询坐标无效');
  return (
    `[out:json][timeout:20];is_in(${lat.toFixed(5)},${lng.toFixed(5)})->.a;` +
    '(relation(pivot.a)["boundary"="administrative"]["admin_level"~"^[56]$"];' +
    'relation(pivot.a)["boundary"="administrative"]["admin_level"="4"]["name"~"^(北京市|天津市|上海市|重庆市)$"];);out geom;'
  );
}

export class AdminAreaLoader {
  private areas = new Map<number, AdminArea>();
  constructor(private request: typeof fetch = (input, init) => fetch(input, init)) {}
  find(point: Position, level: 5 | 6): AdminArea | undefined {
    return [...this.areas.values()].find(
      (a) => a.properties.level === level && areaContains(a, point),
    );
  }
  async load(point: Position, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const response = await this.request('https://overpass.private.coffee/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: adminAreaQuery(point) }),
      signal,
    });
    if (!response.ok) throw new Error('行政区轮廓暂时不可用');
    const text = await response.text();
    if (text.length > 8_000_000) throw new Error('行政区轮廓数据过大');
    const areas = decodeAdminAreas(JSON.parse(text));
    signal.throwIfAborted();
    for (const area of areas) {
      this.areas.delete(area.id);
      this.areas.set(area.id, area);
      if (this.areas.size > 48) this.areas.delete(this.areas.keys().next().value!);
    }
  }
}
