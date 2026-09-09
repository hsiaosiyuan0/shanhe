import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import metadata from '../../public/data/hydrolakes/manifest.json' with { type: 'json' };

export type LakeWater = FeatureCollection<Polygon | MultiPolygon>;
type Entry = { file: string; sha256: string; count: number; bounds?: number[] };
export const hydroManifest = metadata;
const intersects = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

export function lakePackagesInView(bounds: number[], zoom: number): Entry[] {
  // Low zoom retains the complete, detailed geometry of the 210 largest lakes.
  // At regional zoom add every small lake in overlapping 5-degree packages.
  const boxes = [-360, 0, 360].map((offset) => [
    bounds[0] + offset,
    bounds[1],
    bounds[2] + offset,
    bounds[3],
  ]);
  return [
    metadata.overview,
    ...(zoom >= 6 ? metadata.tiles.filter((t) => boxes.some((b) => intersects(b, t.bounds))) : []),
  ];
}

/** Versioned, hash-checked local assets: works on Pages and in the desktop app. */
export class LakePackageLoader {
  private cache = new Map<string, LakeWater>();
  constructor(
    private base: string,
    private request: typeof fetch = (...args) => fetch(...args),
  ) {}

  async read(entry: Entry, signal: AbortSignal): Promise<LakeWater> {
    signal.throwIfAborted();
    const cached = this.cache.get(entry.file);
    if (cached) {
      this.cache.delete(entry.file);
      this.cache.set(entry.file, cached);
      return cached;
    }
    const gzip = typeof DecompressionStream !== 'undefined';
    const response = await this.request(this.base + entry.file + (gzip ? '.gz' : ''), { signal });
    if (!response.ok) throw new Error('湖泊数据下载失败');
    const downloaded = await response.arrayBuffer();
    const magic = new Uint8Array(downloaded, 0, Math.min(2, downloaded.byteLength));
    const bytes =
      gzip && magic[0] === 0x1f && magic[1] === 0x8b
        ? await new Response(
            new Blob([downloaded]).stream().pipeThrough(new DecompressionStream('gzip')),
          ).arrayBuffer()
        : downloaded;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (Array.from(digest, (v) => v.toString(16).padStart(2, '0')).join('') !== entry.sha256)
      throw new Error('湖泊数据校验失败');
    const data = JSON.parse(new TextDecoder().decode(bytes)) as LakeWater;
    if (data.type !== 'FeatureCollection' || data.features.length !== entry.count)
      throw new Error('湖泊数据格式不正确');
    signal.throwIfAborted();
    this.cache.set(entry.file, data);
    while (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }

  async load(bounds: number[], zoom: number, signal: AbortSignal): Promise<LakeWater> {
    const entries = lakePackagesInView(bounds, zoom);
    const data: LakeWater[] = [];
    // Four concurrent package requests prevent a broad viewport exhausting network slots.
    for (let i = 0; i < entries.length; i += 4)
      data.push(
        ...(await Promise.all(entries.slice(i, i + 4).map((entry) => this.read(entry, signal)))),
      );
    signal.throwIfAborted();
    return { type: 'FeatureCollection', features: data.flatMap((d) => d.features) };
  }
}
