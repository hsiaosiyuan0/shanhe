"""Audit preserved downloads with Shapely 2.1.2 (optional, not an app dependency).
Usage: python scripts/audit-admin-package.py > public/data/admin/audit.json
Units are square degrees, not square meters. No geometry is repaired or changed.
"""
import gzip
import hashlib
import json
from pathlib import Path
from shapely.geometry import shape
from shapely import STRtree, __version__
from shapely.validation import explain_validity

root = Path(__file__).resolve().parent.parent / 'public/data/admin'
manifest = json.loads((root / 'manifest.json').read_text())
report = {'sourceVersion': manifest['version'], 'engine': 'Shapely ' + __version__,
          'overlapThresholdSquareDegrees': 1e-10, 'levels': {}}
for level, entry in manifest['levels'].items():
    raw = gzip.decompress((root / entry['originalArchive']).read_bytes())
    assert hashlib.sha256(raw).hexdigest() == entry['originalSha256']
    features = [f for f in json.loads(raw)['features'] if f['geometry']['type'] == 'MultiPolygon']
    shapes = [shape(f['geometry']) for f in features]
    invalid = [{'gb': f['properties']['gb'], 'name': f['properties']['name'], 'reason': explain_validity(g)}
               for f, g in zip(features, shapes) if not g.is_valid]
    overlaps = []
    tree = STRtree(shapes)
    for i, a in enumerate(shapes):
        if not a.is_valid:
            continue
        for j in tree.query(a):
            if j <= i or not shapes[j].is_valid:
                continue
            area = a.intersection(shapes[j]).area
            if area > report['overlapThresholdSquareDegrees']:
                overlaps.append({'a': features[i]['properties'], 'b': features[j]['properties'], 'areaSquareDegrees': area})
    report['levels'][level] = {'originalSha256': entry['originalSha256'], 'areaCount': len(features),
                               'invalid': invalid, 'overlaps': sorted(overlaps, key=lambda x: x['areaSquareDegrees'], reverse=True)}
    if level == '6':
        selected = {f['properties']['name']: g for f, g in zip(features, shapes)
                    if f['properties']['name'] in ['高淳区', '郎溪县', '溧水区', '溧阳市', '宣州区', '广德市']}
        a, b = selected['高淳区'], selected['郎溪县']
        report['screenshotCheck'] = {'names': ['高淳区', '郎溪县'], 'overlapSquareDegrees': a.intersection(b).area,
                                     'sharedBoundaryDegrees': a.boundary.intersection(b.boundary).length,
                                     'areas': {name: {'parts': len(g.geoms), 'holes': sum(len(p.interiors) for p in g.geoms)}
                                               for name, g in selected.items()}}
print(json.dumps(report, ensure_ascii=False, indent=2))
