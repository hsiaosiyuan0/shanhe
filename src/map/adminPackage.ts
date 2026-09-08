import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  MultiLineString,
  Point,
  Position,
} from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { feature, mesh } from 'topojson-client';

export type AdminLevel = 4 | 5 | 6;
export type AdminProperties = {
  name: string;
  gb: string;
  level: AdminLevel;
  center: [number, number];
};
export type AdminArea = Omit<Feature<MultiPolygon, AdminProperties>, 'id' | 'bbox'> & {
  id: string;
  bbox: [number, number, number, number];
};
export type AdminPackage = {
  areas: Omit<FeatureCollection<MultiPolygon, AdminProperties>, 'features'> & {
    features: AdminArea[];
  };
  borders: Feature<MultiLineString>;
  references: FeatureCollection<MultiLineString>;
  labels: FeatureCollection<Point, AdminProperties>;
};
export type AdminManifest = {
  format: string;
  version: string;
  sourceCrs: string;
  levels: Record<
    AdminLevel,
    { file: string; gzipFile?: string; sha256: string; areaCount: number; referenceCount: number }
  >;
};

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
  return area.geometry.coordinates.some(
    ([outer, ...holes]) =>
      pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)),
  );
}

/** Both rendered outlines and hit areas come from these exact, unquantized arcs. */
export function decodeAdminPackage(input: unknown, level: AdminLevel): AdminPackage {
  const data = input as Topology<{ areas: GeometryCollection; references: GeometryCollection }>;
  if (
    data?.type !== 'Topology' ||
    data.transform ||
    data.objects?.areas?.type !== 'GeometryCollection' ||
    data.objects?.references?.type !== 'GeometryCollection' ||
    !Array.isArray(data.arcs)
  )
    throw new Error('行政区数据包格式不正确');
  const areas = feature(data, data.objects.areas) as AdminPackage['areas'];
  const seen = new Set<string>();
  for (const area of areas.features) {
    const p = area.properties;
    if (
      area.geometry?.type !== 'MultiPolygon' ||
      !p?.name ||
      p.level !== level ||
      !/^156\d{6}$/.test(p.gb) ||
      area.id !== p.gb ||
      seen.has(p.gb) ||
      area.bbox?.length !== 4 ||
      p.center?.length !== 2
    )
      throw new Error('行政区数据包区域索引不正确');
    seen.add(p.gb);
  }
  const references = feature(data, data.objects.references) as AdminPackage['references'];
  if (references.features.some((f) => f.geometry.type !== 'MultiLineString'))
    throw new Error('行政区数据包境界线格式不正确');
  return {
    areas,
    // mesh() visits each shared arc once, including holes and detached polygons.
    borders: { type: 'Feature', properties: {}, geometry: mesh(data, data.objects.areas) },
    references,
    labels: {
      type: 'FeatureCollection',
      features: areas.features.map((area) => ({
        type: 'Feature',
        id: area.id,
        properties: area.properties,
        geometry: { type: 'Point', coordinates: area.properties.center },
      })),
    },
  };
}

/** One static, versioned national package per tier; no geocoding or Overpass requests. */
export class AdminPackageLoader {
  private cache = new Map<AdminLevel, AdminPackage>();
  private manifest?: AdminManifest;
  constructor(
    private baseUrl: string,
    private request: typeof fetch = (...args) => fetch(...args),
  ) {}
  async load(level: AdminLevel, signal: AbortSignal): Promise<AdminPackage> {
    signal.throwIfAborted();
    const cached = this.cache.get(level);
    if (cached) return cached;
    if (!this.manifest) {
      const response = await this.request(this.baseUrl + 'manifest.json', {
        signal,
        cache: 'no-cache',
      });
      if (!response.ok) throw new Error('行政区数据目录加载失败');
      const manifest = (await response.json()) as AdminManifest;
      if (
        manifest.format !== 'shanhe-admin-v1' ||
        manifest.sourceCrs !== 'EPSG:4490' ||
        ![4, 5, 6].every((l) => {
          const entry = manifest.levels?.[l as AdminLevel];
          return (
            /^[a-z]+\.topo\.json$/.test(entry?.file) &&
            (entry.gzipFile === undefined || entry.gzipFile === `${entry.file}.gz`)
          );
        })
      )
        throw new Error('行政区数据目录格式不正确');
      this.manifest = manifest;
    }
    const entry = this.manifest.levels[level];
    const compressed = entry.gzipFile && typeof DecompressionStream !== 'undefined';
    const response = await this.request(this.baseUrl + (compressed ? entry.gzipFile : entry.file), {
      signal,
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error('行政区数据包加载失败');
    const downloaded = await response.arrayBuffer();
    // Explicit gzip assets also work on static hosts that do not compress JSON responses.
    // Some hosts set Content-Encoding and fetch has already decoded the body; inspect bytes
    // to avoid decompressing twice. Both paths verify the same unchanged package hash.
    const header = new Uint8Array(downloaded, 0, Math.min(2, downloaded.byteLength));
    const bytes =
      compressed && header[0] === 0x1f && header[1] === 0x8b
        ? await new Response(
            new Blob([downloaded]).stream().pipeThrough(new DecompressionStream('gzip')),
          ).arrayBuffer()
        : downloaded;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
      '',
    );
    if (hash !== entry.sha256) {
      this.manifest = undefined; // Retry can recover from an old manifest during deployment.
      throw new Error('行政区数据包校验失败，请重新加载');
    }
    signal.throwIfAborted();
    const result = decodeAdminPackage(JSON.parse(new TextDecoder().decode(bytes)), level);
    if (
      result.areas.features.length !== entry.areaCount ||
      result.references.features.length !== entry.referenceCount
    )
      throw new Error('行政区数据包不完整');
    this.cache.set(level, result);
    return result;
  }
}
