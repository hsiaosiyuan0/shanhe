import data from './data/lake-catalog.json' with { type: 'json' };
import enrichment from './data/lake-name-enrichment.json' with { type: 'json' };

export type LakeNameEvidence = {
  source: string;
  sourceId: string;
  url: string;
  method: string;
  field: string;
  value: string;
  point?: number[];
};
export type LakeRecord = (typeof data)[number] & {
  aliases?: string[];
  nameEvidence?: LakeNameEvidence[];
  nameStatus?: string;
};

export const lakeSource = {
  title: 'HydroLAKES v1.0 · 湖泊与水库',
  url: 'https://www.hydrosheds.org/products/hydrolakes',
  revision: '1.0',
  license: 'CC-BY-4.0',
  scale: '中国区域约 1:25 万；各要素精度不同',
  observationDate: null,
  limitation: '多源静态湖泊轮廓，非实时水面。洞庭湖命名要素仅覆盖局部，不能用其面积代表全湖。',
};
// Centers are computed inside the downloaded polygons, never invented coordinates.
// Names are an independently sourced overlay. Original lake geometry/properties stay intact.
export const lakeCatalog: LakeRecord[] = [
  ...new Map<string, LakeRecord>([...data, ...enrichment].map((l) => [l.id, l])).values(),
].sort((a, b) => Number(b.priority) - Number(a.priority) || b.areaKm2 - a.areaKm2);
export function searchLakes(query: string) {
  const normalized = query.replaceAll(/\s/g, '').toLowerCase();
  return lakeCatalog.filter(
    (lake) =>
      lake.label &&
      `${lake.id} ${lake.label} ${(lake.aliases ?? []).join(' ')} ${lake.name ?? ''} ${lake.name ?? ''} Hu`
        .replaceAll(/\s/g, '')
        .toLowerCase()
        .includes(normalized),
  );
}
