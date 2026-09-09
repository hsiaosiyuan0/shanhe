"""Join independently sourced names without changing any HydroLAKES shoreline.

Python 3 + shapely 2.1.2. Run with GDW_v1_0_shp.zip and GeoNames CN.zip.
GDW joins require stable IDs; GeoNames joins require unique point containment.
No nearest-place fallback, transliteration to invented Chinese, or dam-name-to-lake-name conversion.
"""
import collections
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
GDW_HASH = '2fe0b367ed3fcfb299160cd9652b16a8a19338951026ee2ac91edfebf1f3b7ae'
GN_HASH = '547e7e972084a0aa600512fa54c95e3fcf04166130a2f8f77898d9daf66e74c8'
GDW_URL = 'https://doi.org/10.6084/m9.figshare.25988293.v1'
GN_URL = 'https://download.geonames.org/export/dump/CN.zip'

def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def han(value):
    return bool(re.search('[\u3400-\u9fff]', value))

def unique(values):
    return list(dict.fromkeys(v.strip() for v in values if v and v.strip()))

def run(gdw_path, gn_path):
    gdw_bytes, gn_bytes = Path(gdw_path).read_bytes(), Path(gn_path).read_bytes()
    assert sha(gdw_bytes) == GDW_HASH, 'Unexpected GDW version'
    with zipfile.ZipFile(io.BytesIO(gdw_bytes)) as z:
        gdw_raw = z.read('GDW_v1_0_shp/GDW_barriers_v1_0.txt')
    gdw = list(csv.DictReader(io.StringIO(gdw_raw.decode('utf-8-sig'))))
    if str(gn_path).endswith('.json.gz'):
        # The upstream country dump changes daily. The checked-in complete water
        # excerpt also retains unmatched/conflicting points, enabling exact replay.
        previous = json.loads((ROOT/'public/data/lake-names/manifest.json').read_text())['geonames']
        raw = gzip.decompress(gn_bytes)
        assert previous['sha256'] == GN_HASH and sha(raw) == previous['waterSha256']
        water = json.loads(raw)
    else:
        assert sha(gn_bytes) == GN_HASH, 'Unexpected GeoNames snapshot; audit updates before changing this hash'
        with zipfile.ZipFile(io.BytesIO(gn_bytes)) as z:
            assert z.testzip() is None
            gn_raw = z.read('CN.txt').decode('utf-8')
        water = []
        for line in gn_raw.splitlines():
            r = line.split('\t')
            if len(r) != 19 or r[6] != 'H' or r[7] not in ('LK', 'RSV'):
                continue
            water.append(dict(id=int(r[0]), name=r[1], asciiName=r[2],
                              aliases=unique(r[3].split(',')), center=[float(r[5]), float(r[4])],
                              code=r[7], country=r[8], updated=r[18]))

    manifest = json.loads((ROOT/'public/data/hydrolakes/manifest.json').read_text())
    features = []
    for entry in [manifest['overview'], *manifest['tiles']]:
        raw = (ROOT/'public/data/hydrolakes'/entry['file']).read_bytes()
        assert sha(raw) == entry['sha256']
        features.extend(json.loads(raw)['features'])
    by_id = {str(f['properties']['Hylak_id']): f for f in features}
    geometries = {ident: shape(f['geometry']) for ident, f in by_id.items()}
    originals = json.loads((ROOT/'shared/data/lake-catalog.json').read_text())
    base = {str(l['sourceId']): l for l in originals}
    overrides = json.loads((ROOT/'scripts/lake-name-overrides.json').read_text())
    gdw_grand, gdw_hylak = collections.defaultdict(list), collections.defaultdict(list)
    for r in gdw:
        if int(r['GRAND_ID']) > 0:
            gdw_grand[int(r['GRAND_ID'])].append(r)
        if int(r['HYLAK_ID']) > 0:
            gdw_hylak[r['HYLAK_ID']].append(r)

    # Only valid polygons enter the point index; never repair/change the source geometry.
    valid_ids = [ident for ident, g in geometries.items() if g.is_valid]
    tree = STRtree([geometries[ident] for ident in valid_ids])
    candidates = collections.defaultdict(list)
    rejected = []
    for r in water:
        hits = tree.query(Point(r['center']), predicate='covered_by')
        ids = [valid_ids[i] for i in hits]
        if len(ids) == 1:
            candidates[ids[0]].append(r)
        elif len(ids) > 1:
            rejected.append(dict(source='GeoNames', id=r['id'], reason='multiple-polygons', targets=ids))

    entries, evidence_rows, gdw_used = [], [], {}
    for ident, f in by_id.items():
        p, g = f['properties'], geometries[ident]
        info = dict(base.get(ident) or dict(id=f['id'], sourceId=p['Hylak_id'], name=p['Lake_name'],
            label='', kind={1:'Lake', 2:'Reservoir', 3:'Regulated lake'}[p['Lake_type']],
            center=list(g.representative_point().coords[0]), bounds=list(g.bounds),
            labelZoom=6 if p['Lake_area'] >= 100 else 8 if p['Lake_area'] >= 10 else 10,
            priority=False, areaKm2=p['Lake_area'], polygonSource=p['Poly_src'],
            coverage='source-record', observationDate=None))
        aliases, evidence, status = [], [], 'source-name'
        matches = gdw_grand.get(p['Grand_id'], []) if p['Grand_id'] > 0 else gdw_hylak.get(ident, [])
        match = None
        if len(matches) == 1:
            r = matches[0]
            point = Point(float(r['LONG_RIV']), float(r['LAT_RIV']))
            # HydroLAKES 1.0 and GDW must agree on both identifiers. Non-GRanD
            # records additionally need the GDW point inside the existing polygon.
            if r['HYLAK_ID'] == ident and (p['Grand_id'] > 0 or (g.is_valid and g.covers(point))):
                match = r
                gdw_used[r['GDW_ID']] = r
                field = 'RES_NAME' if r['RES_NAME'] else 'DAM_NAME'
                if r[field]:
                    aliases += [r[field]]
                    evidence.append(dict(source='GDW v1.0', sourceId=r['GDW_ID'], url=GDW_URL,
                        method='grand-id' if p['Grand_id'] > 0 else 'hylak-id-and-containment',
                        field=field, value=r[field], grandId=p['Grand_id'], hylakId=p['Hylak_id']))
                    if not info['label']:
                        info['label'] = r[field] if field == 'RES_NAME' else r[field] + ' · 库区'
                        status = 'reservoir-name' if field == 'RES_NAME' else 'dam-associated'
        elif len(matches) > 1:
            rejected.append(dict(source='GDW', id=ident, reason='multiple-dams'))

        points = candidates.get(ident, [])
        if len(points) == 1:
            r = points[0]
            names = unique([r['name'], *r['aliases']])
            chinese = [n for n in names if han(n)]
            if han(info['label']) and chinese and info['label'] not in chinese:
                rejected.append(dict(source='GeoNames', id=ident, reason='conflicting-existing-name',
                    existing=info['label'], candidates=chinese))
                points = []
        if len(points) == 1:
            r = points[0]
            names = unique([r['name'], *r['aliases']])
            chinese = [n for n in names if han(n)]
            # A single Chinese alias is unambiguous. Multiple Chinese variants
            # stay as aliases; do not arbitrarily choose one as the primary name.
            label = r['name'] if han(r['name']) else chinese[0] if len(chinese) == 1 else r['name']
            aliases += names
            evidence.append(dict(source='GeoNames', sourceId=str(r['id']),
                url=f"https://www.geonames.org/{r['id']}/", method='point-in-polygon',
                field='name/alternatenames', value=label, point=r['center'], featureCode=r['code']))
            evidence_rows.append({**r, 'hylakId':p['Hylak_id']})
            if not info['label'] or status == 'dam-associated' or (not han(info['label']) and han(label)):
                if info['label']:
                    aliases.append(info['label'])
                info['label'], status = label, 'gazetteer-name'
        elif len(points) > 1:
            # Adjacent sub-lakes may be represented by one coarse polygon.
            # Do not assign any one sub-lake's name to the entire surface.
            rejected.append(dict(source='GeoNames', id=ident, reason='multiple-names-in-polygon',
                candidates=[dict(id=r['id'], name=r['name']) for r in points]))

        if ident in overrides:
            o = overrides[ident]
            assert match and p['Grand_id'] == o['grandId'] and int(match['GDW_ID']) == o['gdwId']
            assert match['DAM_NAME'] == o['damName']
            info['label'], status = o['label'], 'verified-name'
            aliases += o['aliases']
            evidence.append(dict(source=o['sourceTitle'], sourceId=str(o['gdwId']), url=o['url'],
                method='document-and-id', field='name', value=o['label']))
        if evidence and info['label']:
            info.update(aliases=unique(n for n in aliases if n != info['label']),
                        nameEvidence=evidence, nameStatus=status)
            entries.append(info)

    output = ROOT/'public/data/lake-names'
    output.mkdir(parents=True, exist_ok=True)
    gdw_excerpt = encode(list(gdw_used.values()))
    gn_excerpt = encode(evidence_rows)
    water_excerpt = encode(water)
    for file, data in [('gdw-used.json.gz', gdw_excerpt), ('geonames-matched.json.gz', gn_excerpt), ('geonames-water.json.gz', water_excerpt)]:
        (output/file).write_bytes(gzip.compress(data, mtime=0))
    final = {**base, **{str(l['sourceId']):l for l in entries}}
    summary = dict(originalNamed=len(base), totalNamed=len(final),
        chineseNamed=sum(han(l['label']) and l.get('nameStatus')!='dam-associated' for l in final.values()),
        damAssociated=sum(l.get('nameStatus')=='dam-associated' for l in final.values()),
        added=len(final)-len(base), matchedGeoNames=len(evidence_rows),
        rejected=rejected)
    (output/'manifest.json').write_text(json.dumps(dict(version=1,
        gdw=dict(url=GDW_URL, downloadUrl='https://ndownloader.figshare.com/files/47913754',
                 sha256=sha(gdw_bytes), license='CC-BY-4.0', excerptSha256=sha(gdw_excerpt)),
        geonames=dict(url=GN_URL, sha256=GN_HASH, license='CC-BY-4.0', snapshotDate='2026-09-09',
                      waterSha256=sha(water_excerpt), waterRecords=len(water), excerptSha256=sha(gn_excerpt)),
        rules='Stable IDs for GDW; unique point containment for GeoNames; no nearest-name joins.',
        **summary), ensure_ascii=False, indent=2)+'\n')
    (ROOT/'shared/data/lake-name-enrichment.json').write_bytes(encode(entries))
    print(json.dumps({k:v for k,v in summary.items() if k!='rejected'},ensure_ascii=False),flush=True)

if __name__ == '__main__':
    run(*sys.argv[1:3])
