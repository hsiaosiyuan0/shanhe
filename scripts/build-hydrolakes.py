"""Extract complete HydroLAKES v1 polygons; Python 3 + pyshp 2.3.1 + shapely 2.1.2.

Run from the project root: python scripts/build-hydrolakes.py <official zip>
The original coordinates and holes are retained, including source geometry defects.
No country boundary, hand-drawn shoreline, buffer or inferred lake connection is used.
"""
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import struct
import tempfile
import zipfile
import shapefile
from shapely.geometry import shape, Point

SOURCE_HASH = '9ef63498569dd7ccd0b8d8852da026e009a75f42d293f00e483f3b9fcfe8e1f9'
REGION = [75, 15, 135, 54]
OUTPUT = Path('public/data/hydrolakes')

def encode(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def geometry_hash(geometry):
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    data = bytearray(struct.pack('<I', len(polygons)))
    for polygon in polygons:
        data.extend(struct.pack('<I',len(polygon)))
        for ring in polygon:
            data.extend(struct.pack('<I',len(ring)))
            for x,y in ring:
                data.extend(struct.pack('<dd',x,y))
    return digest(data)

def write_package(name, features):
    data = encode({'type': 'FeatureCollection', 'features': features})
    zipped = gzip.compress(data, compresslevel=9, mtime=0)
    file = f'{name}-{digest(data)[:12]}.geojson'
    (OUTPUT / file).write_bytes(data)
    (OUTPUT / (file + '.gz')).write_bytes(zipped)
    return dict(file=file, sha256=digest(data), bytes=len(data), gzipBytes=len(zipped), count=len(features))

archive = Path(sys.argv[1])
with archive.open('rb') as f:
    assert hashlib.file_digest(f, 'sha256').hexdigest() == SOURCE_HASH, 'Unexpected upstream archive'
OUTPUT.mkdir(parents=True, exist_ok=True)
# An audited name translation is metadata only. Names must match the upstream record.
translations = json.loads(Path('scripts/hydrolakes-names.json').read_text())
catalog, overview, cells, invalid, sources = [], [], collections.defaultdict(list), [], collections.Counter()
record_hashes = {}
count = points = 0
with tempfile.TemporaryDirectory() as folder:
    with zipfile.ZipFile(archive) as z:
        stem = 'HydroLAKES_polys_v10_shp/HydroLAKES_polys_v10'
        for ext in ['shp', 'shx', 'dbf', 'prj']:
            z.extract(stem + '.' + ext, folder)
    projection = Path(folder, stem + '.prj').read_text()
    assert 'GCS_WGS_1984' in projection
    reader = shapefile.Reader(str(Path(folder, stem)), encoding='utf-8')
    for record in reader.iterShapeRecords(bbox=REGION):
        p = record.record.as_dict()
        geometry = record.shape.__geo_interface__
        geometry = json.loads(encode(geometry))
        g = shape(geometry)
        ident = str(p['Hylak_id'])
        if not g.is_valid:
            invalid.append(ident)
        # representative_point respects holes; does not modify the polygon.
        center = list(g.representative_point().coords[0])
        assert g.covers(Point(center))
        bounds = list(record.shape.bbox)
        translation = translations.get(ident)
        if translation:
            assert p['Lake_name'] == translation['sourceName'], (ident, p['Lake_name'])
        label = translation['label'] if translation else p['Lake_name']
        priority = ident in ['151', '1470', '148', '145']
        zoom = 4.5 if priority else 5 if p['Lake_area'] >= 500 else 6 if p['Lake_area'] >= 100 else 8 if p['Lake_area'] >= 10 else 10
        info = dict(id='hydrolakes:' + ident, sourceId=p['Hylak_id'], name=p['Lake_name'],
                    label=label, kind={1:'Lake', 2:'Reservoir', 3:'Regulated lake'}[p['Lake_type']],
                    center=center, bounds=bounds, labelZoom=zoom, priority=priority,
                    areaKm2=p['Lake_area'], polygonSource=p['Poly_src'],
                    coverage='partial' if ident == '1470' else 'source-record', observationDate=None)
        if label:
            catalog.append(info)
        # Full original attributes are retained for provenance, including unnamed lakes.
        feature = dict(type='Feature', id=info['id'], properties={**p, 'source_id':info['id'], 'label':label}, geometry=geometry)
        record_hashes[ident] = geometry_hash(geometry)
        count += 1
        points += len(record.shape.points)
        sources[p['Poly_src']] += 1
        if p['Lake_area'] >= 100 or priority:
            overview.append(feature)
        else:
            # Assign once; tile bounds cover full features, so cross-cell lakes never get clipped.
            cell = f'{math.floor(center[0]/5)*5}-{math.floor(center[1]/5)*5}'
            cells[cell].append(feature)
        if count % 10000 == 0:
            print(f'Extracted {count} polygons', flush=True)

manifest = dict(format='shanhe-hydrolakes-v1', version='1.0',
                source='HydroLAKES v1.0', url='https://www.hydrosheds.org/products/hydrolakes',
                downloadUrl='https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip',
                archiveSha256=SOURCE_HASH, license='CC-BY-4.0', sourceCrs='EPSG:4326',
                region=REGION, count=count, coordinateCount=points, polygonSources=dict(sources),
                retainedInvalidSourceIds=invalid, overview=write_package('overview', overview), tiles=[])
for cell, features in sorted(cells.items()):
    b = [shape(f['geometry']).bounds for f in features]
    bounds = [min(v[0] for v in b), min(v[1] for v in b), max(v[2] for v in b), max(v[3] for v in b)]
    manifest['tiles'].append({**write_package(cell, features), 'bounds':bounds})
Path('shared/data/lake-catalog.json').write_bytes(encode(sorted(catalog, key=lambda l:(not l['priority'], -l['areaKm2']))))
Path('public/data/hydrolakes/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
current_files = {e['file'] for e in [manifest['overview'], *manifest['tiles']]}
for old in OUTPUT.glob('*.geojson*'):
    if old.name.removesuffix('.gz') not in current_files:
        old.unlink()
Path('public/data/hydrolakes/geometry-hashes.json.gz').write_bytes(gzip.compress(encode(record_hashes), mtime=0))
print(json.dumps({k:manifest[k] for k in ['count','coordinateCount','retainedInvalidSourceIds','polygonSources']},ensure_ascii=False))
print('Named lakes:',len(catalog),'tiles:',len(cells),'compressed bytes:',sum(p.stat().st_size for p in OUTPUT.glob('*.geojson.gz')))
