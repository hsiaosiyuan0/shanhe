import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { FeatureCollection, LineString, MultiLineString } from 'geojson';
import { clipBoundaryLines } from './clipBoundaryLines';

// OpenFreeMap's z6–8 tiles omit admin levels 5/6. Read real z9 geometry for
// the overview instead of assuming a style's minzoom can create missing data.
export const boundaryTileZoom = 9;
export type BoundaryData = FeatureCollection<LineString | MultiLineString>;
export type BoundaryTile = { x: number; y: number; z: number };
export function boundaryTilesForBounds(bounds: [number, number, number, number]): BoundaryTile[] {
  const [west, south, east, north] = bounds;
  const n = 2 ** boundaryTileZoom;
  const tileX = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const tileY = (lat: number) =>
    Math.max(
      0,
      Math.min(
        n - 1,
        Math.floor(
          ((1 -
            Math.asinh(Math.tan((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180)) / Math.PI) /
            2) *
            n,
        ),
      ),
    );
  const minX = tileX(west),
    maxX = tileX(east < west ? east + 360 : east);
  const minY = tileY(north),
    maxY = tileY(south);
  if ((maxX - minX + 1) * (maxY - minY + 1) > 192)
    throw new Error('当前范围较大，请放大地图以加载市县边界');
  const result: BoundaryTile[] = [];
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++)
      result.push({ x: ((x % n) + n) % n, y, z: boundaryTileZoom });
  return result;
}

export function decodeBoundaryTile(bytes: Uint8Array, tile: BoundaryTile): BoundaryData {
  const layer = new VectorTile(new Pbf(bytes)).layers.boundary;
  const features: BoundaryData['features'] = [];
  for (let i = 0; i < (layer?.length || 0); i++) {
    const feature = layer.feature(i);
    if (
      ![4, 5, 6].includes(Number(feature.properties.admin_level)) ||
      feature.properties.maritime === 1
    )
      continue;
    if (feature.type !== 2) continue;
    const size = feature.extent * 2 ** tile.z;
    const lines = clipBoundaryLines(feature.loadGeometry(), feature.extent).map((line) =>
      line.map(({ x, y }) => {
        const mercatorY = 180 - ((y + tile.y * feature.extent) * 360) / size;
        return [
          ((x + tile.x * feature.extent) * 360) / size - 180,
          (360 / Math.PI) * Math.atan(Math.exp((mercatorY * Math.PI) / 180)) - 90,
        ];
      }),
    );
    if (!lines.length) continue;
    features.push({
      type: 'Feature',
      properties: { ...feature.properties, admin_level: Number(feature.properties.admin_level) },
      geometry:
        lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Cache decoded lines, not the much larger tiles' roads, buildings and POIs. */
export class AdminBoundaryTileLoader {
  private cache = new Map<string, BoundaryData>();
  private template?: string;
  constructor(private request: typeof fetch = (input, init) => fetch(input, init)) {}
  async load(tiles: BoundaryTile[], signal: AbortSignal): Promise<BoundaryData> {
    signal.throwIfAborted();
    if (!this.template) {
      const response = await this.request('https://tiles.openfreemap.org/planet', { signal });
      if (!response.ok) throw new Error('无法读取市县边界数据源');
      const data = await response.json();
      if (
        typeof data.tiles?.[0] !== 'string' ||
        !data.tiles[0].startsWith('https://tiles.openfreemap.org/')
      )
        throw new Error('市县边界数据源无效');
      this.template = data.tiles[0];
    }
    let next = 0;
    const results: BoundaryData[] = new Array(tiles.length);
    await Promise.all(
      Array.from({ length: Math.min(6, tiles.length) }, async () => {
        while (next < tiles.length) {
          signal.throwIfAborted();
          const index = next++,
            tile = tiles[index];
          const url = this.template!.replace('{z}', String(tile.z))
            .replace('{x}', String(tile.x))
            .replace('{y}', String(tile.y));
          let data = this.cache.get(url);
          if (!data) {
            const response = await this.request(url, { signal });
            if (!response.ok) throw new Error('部分市县边界加载失败，请重试');
            data = decodeBoundaryTile(new Uint8Array(await response.arrayBuffer()), tile);
            this.cache.set(url, data);
            if (this.cache.size > 192) this.cache.delete(this.cache.keys().next().value!);
          }
          results[index] = data;
        }
      }),
    );
    signal.throwIfAborted();
    return { type: 'FeatureCollection', features: results.flatMap((data) => data.features) };
  }
}
