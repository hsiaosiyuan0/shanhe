"""Verify native crops and displayed indexed pixels against the original JRC tile."""
import hashlib,json,sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import calculate_default_transform,reproject,Resampling
base=Path('public/data/lake-reference')
m=json.loads((base/'manifest.json').read_text())
with open(sys.argv[1],'rb') as f:
    assert hashlib.file_digest(f,'sha256').hexdigest()==m['sourceSha256']
with rasterio.open(sys.argv[1]) as source:
    for area in m['images']:
        with rasterio.open(base/area['nativeCrop']) as crop:
            data=crop.read(1)
            win=from_bounds(*crop.bounds,source.transform).round_offsets().round_lengths()
            assert np.array_equal(data,source.read(1,window=win))
            assert hashlib.sha256(data.tobytes()).hexdigest()==area['nativePixelSha256']
            affine,w,h=calculate_default_transform(crop.crs,'EPSG:3857',crop.width,crop.height,*crop.bounds,resolution=50)
            expected=np.zeros((h,w),dtype=np.uint8)
            reproject(data,expected,src_transform=crop.transform,src_crs=crop.crs,dst_transform=affine,dst_crs='EPSG:3857',resampling=Resampling.nearest)
        with rasterio.open(base/area['file']) as png:
            assert np.array_equal(png.read(1),expected)
            colors=png.colormap(1)
            assert colors[0][3]==0 and colors[100][3]==240
        print(area['label'],': native crop and all display pixels exactly verified')
