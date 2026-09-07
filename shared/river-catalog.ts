import data from './data/river-catalog.json' with { type: 'json' };
import { riverChannelSchema } from './rivers.js';

// Curated extracts of the bundled Natural Earth data; no generated coordinates.
export const riverCatalog = data.map((river) => riverChannelSchema.parse(river));
export function catalogRiver(catalogId: string, id: string) {
  const river = riverCatalog.find((r) => r.id === catalogId);
  if (!river) throw new Error('河道目录中没有这个 ID；请先调用 search_rivers');
  return riverChannelSchema.parse({ ...structuredClone(river), id });
}
