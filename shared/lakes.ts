import data from './data/lake-catalog.json' with { type: 'json' };

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
export const lakeCatalog = data;
export function searchLakes(query: string) {
  const normalized = query.replaceAll(/\s/g, '').toLowerCase();
  return lakeCatalog.filter(
    (lake) =>
      lake.label &&
      `${lake.id} ${lake.label} ${lake.name ?? ''} ${lake.name ?? ''} Hu`
        .replaceAll(/\s/g, '')
        .toLowerCase()
        .includes(normalized),
  );
}
