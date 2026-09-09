import metadata from '../public/data/lake-reference/manifest.json' with { type: 'json' };
export const lakeReference = metadata;
export const referenceForLake = (id: string) =>
  metadata.images.find(
    (image) =>
      image.id ===
      (id === 'hydrolakes:151' ? 'poyang' : id === 'hydrolakes:1470' ? 'dongting' : ''),
  );
