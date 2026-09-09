import data from './data/lake-catalog.json' with { type: 'json' };

export const lakeSource = {
  title: 'Natural Earth · Lakes + Reservoirs · 1:10m',
  url: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/',
  revision: 'ca96624a56bd078437bca8184e78163e5039ad19',
};
// Centers are computed inside the downloaded polygons, never invented coordinates.
export const lakeCatalog = data;
export function searchLakes(query: string) {
  const normalized = query.replaceAll(/\s/g, '').toLowerCase();
  return lakeCatalog.filter(
    (lake) =>
      lake.label &&
      `${lake.id}${lake.label}${lake.name ?? ''}`
        .replaceAll(/\s/g, '')
        .toLowerCase()
        .includes(normalized),
  );
}
