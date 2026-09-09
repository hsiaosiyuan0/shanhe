"""Build offline JRC occurrence comparison images, not inferred lake boundaries.

Python 3.12 + rasterio 1.4.3. Input: official GSW v1.5 occurrence 110E_30N tile.
Retains native pixel crops for audit; display is reprojected with nearest neighbour.
"""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import calculate_default_transform, reproject, Resampling, transform_bounds

source = Path(sys.argv[1])
out = Path('public/data/lake-reference')
out.mkdir(parents=True, exist_ok=True)
with source.open('rb') as f:
    source_hash = hashlib.file_digest(f, 'sha256').hexdigest()
assert source_hash == 'a67a91d67d17576accb5374b6bbdda6763b4f191d61111e711cf50db465abe0d', 'Unexpected JRC source version'
areas = [('poyang', '鄱阳湖区域', [115.65,28.6,116.85,29.9]), ('dongting','洞庭湖区域',[111.8,28.6,113.35,29.8])]
images = []
with rasterio.open(source) as src:
    assert src.crs.to_epsg() == 4326 and src.width == 40000 and src.height == 40000
    for ident, label, bounds in areas:
        window = from_bounds(*bounds, src.transform).round_offsets().round_lengths()
        raw = src.read(1, window=window)
        raw_transform = src.window_transform(window)
        crop = out / (ident + '-occurrence.tif')
        with rasterio.open(crop, 'w', driver='GTiff', height=raw.shape[0], width=raw.shape[1],
                           count=1, dtype='uint8', crs=src.crs, transform=raw_transform, compress='deflate') as dst:
            dst.write(raw, 1)
        cropped_bounds = rasterio.windows.bounds(window, src.transform)
        affine, width, height = calculate_default_transform(src.crs, 'EPSG:3857', raw.shape[1], raw.shape[0], *cropped_bounds, resolution=50)
        projected = np.zeros((height,width), dtype=np.uint8)
        reproject(raw, projected, src_transform=raw_transform, src_crs=src.crs,
                  dst_transform=affine, dst_crs='EPSG:3857', resampling=Resampling.nearest)
        png = out / (ident + '-occurrence.png')
        # Indexed PNG keeps the 101 exact source classes with lossless compression.
        palette = {v: tuple(round(a+(b-a)*min(v,100)/100) for a,b in zip([195,225,215],[32,113,144])) + ((240 if 1 <= v <= 100 else 0),) for v in range(256)}
        with rasterio.open(png, 'w', driver='PNG', height=height, width=width, count=1, dtype='uint8') as dst:
            dst.write(projected, 1)
            dst.write_colormap(1,palette)
        b = transform_bounds('EPSG:3857','EPSG:4326',*rasterio.transform.array_bounds(height,width,affine))
        images.append(dict(id=ident,label=label,bounds=list(b),
                           corners=[[b[0],b[3]],[b[2],b[3]],[b[2],b[1]],[b[0],b[1]]],
                           file=png.name,sha256=hashlib.sha256(png.read_bytes()).hexdigest(),
                           nativeCrop=crop.name,nativePixelSha256=hashlib.sha256(raw.tobytes()).hexdigest(),
                           nativeShape=list(raw.shape),displaySize=[width,height]))
manifest = dict(source='EC JRC/Google · Global Surface Water v1.5',
    url='https://global-surface-water.appspot.com/download',period='1984–2024',
    downloadUrl='https://s3.waw4-1.cloudferro.com/swift/v1/global-surface-water/download2024/Aggregated/VER1-5/occurrence/occurrence_110E_30N_v1_5_2024.tif',
    sourceSha256=source_hash,resolutionMeters=30,displayMercatorMeters=50,
    meaning='长期观测中的水面出现频率（%）；包括河流、湖泊、水库、季节性水面及其他积水，不是某年的湖岸或全湖边界。',
    colors=['#c3e1d7','#207190'],images=images)
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False))
