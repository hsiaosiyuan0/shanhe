import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { topology } from 'topojson-server';
import polylabel from 'polylabel';

// Repack the downloaded files without rounding, quantization, smoothing, merging
// regions, closing gaps or changing administrative membership.
const [directory, output = 'public/data/admin'] = process.argv.slice(2);
if (!directory)
  throw new Error(
    'Usage: node scripts/build-admin-package.mjs <download directory> [output directory]',
  );
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const originalHashes = {
  4: '3af8294f9ad61cc2bf84c1bb7e4bbf86a6336c68d754b699a0e6ddc33ef81486',
  5: 'd7a6f05b7e58cf758d74bd71ed0ea2ce981ef99436e4881e9a68098c3cd80b3b',
  6: '91edf86abe109a1de33052977852e37f848f350d37ae069b40e0d80dcc2a97d3',
};
const source = {
  name: '国家地理信息公共服务平台 · 天地图',
  url: 'https://cloudcenter.tianditu.gov.cn/administrativeDivision/',
  version: '2025-09',
  downloadedAt: '2026-09-08',
  sourceCrs: 'EPSG:4490',
  sourceMapApproval: 'GS（2024）0650号',
  usage: '该数据仅供地图可视化使用（来源页面说明）',
  displayCoordinates:
    'CGCS2000 经纬度原值；区域尺度下按地理经纬度近似显示，未施加 GCJ-02 偏移，不用于测绘。',
};
const manifest = { format: 'shanhe-admin-v1', ...source, levels: {} };
mkdirSync(join(output, 'source'), { recursive: true });
const outerArea = (ring) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0),
  );
for (const [level, name, file] of [
  [4, '省', 'province'],
  [5, '市', 'city'],
  [6, '县', 'county'],
]) {
  const path = resolve(directory, `中国_${name}.geojson`);
  const bytes = readFileSync(path);
  if (sha256(bytes) !== originalHashes[level])
    throw new Error(`${basename(path)}: 文件与记录版本不一致，请先核验来源并更新版本和哈希`);
  const raw = JSON.parse(bytes);
  if (
    raw.type !== 'FeatureCollection' ||
    raw.crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::4490'
  )
    throw new Error(`${basename(path)}: 需要来源标注为 EPSG:4490 的天地图 FeatureCollection`);
  const areas = [],
    references = [],
    codes = new Set();
  for (const feature of raw.features) {
    const { geometry, properties } = feature;
    if (geometry.type === 'MultiLineString') {
      references.push(feature); // Keep the source's separate boundary reference lines.
      continue;
    }
    if (geometry.type !== 'MultiPolygon' || !geometry.coordinates.length)
      throw new Error(`${name}: 未知几何类型 ${geometry.type}`);
    const { gb, name: areaName } = properties;
    if (!/^156\d{6}$/.test(gb) || !areaName || codes.has(gb))
      throw new Error(`${name}: 缺失或重复的行政代码 ${gb}`);
    codes.add(gb);
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of geometry.coordinates) {
      if (!polygon.length) throw new Error(`${gb}: 空多边形`);
      for (const ring of polygon) {
        if (ring.length < 4 || JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1)))
          throw new Error(`${gb}: 非闭合环；请核验源数据，不自动补线`);
        for (const point of ring) {
          if (
            point.length !== 2 ||
            !point.every(Number.isFinite) ||
            Math.abs(point[0]) > 180 ||
            Math.abs(point[1]) > 90
          )
            throw new Error(`${gb}: 无效坐标`);
          bounds[0] = Math.min(bounds[0], point[0]);
          bounds[1] = Math.min(bounds[1], point[1]);
          bounds[2] = Math.max(bounds[2], point[0]);
          bounds[3] = Math.max(bounds[3], point[1]);
        }
      }
    }
    const largest = geometry.coordinates.reduce((a, b) =>
      outerArea(a[0]) >= outerArea(b[0]) ? a : b,
    );
    // This is a label anchor inside the supplied area, not a claimed government seat.
    const center = polylabel(largest, 0.001).slice(0, 2);
    areas.push({
      type: 'Feature',
      id: gb,
      bbox: bounds,
      properties: { name: areaName, gb, level, center },
      geometry,
    });
  }
  const packageData = topology({
    areas: { type: 'FeatureCollection', features: areas },
    references: { type: 'FeatureCollection', features: references },
  }); // No quantization: preserve every source coordinate.
  const body = JSON.stringify(packageData);
  const archive = `source/${file}.geojson.gz`;
  writeFileSync(join(output, archive), gzipSync(bytes, { level: 9 }));
  writeFileSync(join(output, `${file}.topo.json`), body);
  manifest.levels[level] = {
    file: `${file}.topo.json`,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body),
    areaCount: areas.length,
    referenceCount: references.length,
    originalFile: basename(path),
    originalArchive: archive,
    originalSha256: sha256(bytes),
    originalBytes: bytes.length,
  };
  console.log(
    `${name}: ${areas.length} 个区域，${references.length} 个独立境界线要素，${Buffer.byteLength(body)} bytes`,
  );
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
