# 地理数据

来自 [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector)，数据为[公共领域](https://www.naturalearthdata.com/about/terms-of-use/)。

- `land.geojson`：`ne_110m_land.geojson`，全球陆地轮廓，未包含国界。
- `rivers.geojson`：从 `ne_50m_rivers_lake_centerlines.geojson` 提取与 75–135°E / 15–54°N 区域相交的 80 条河流要素；保留 name、name_zh、scalerank 属性。
- `admin.geojson`：从 `ne_10m_admin_1_states_provinces.geojson` 提取 31 个中国大陆省级行政区（`adm0_a3=CHN`、`adm1_code` 以 `CHN-` 开头）。保留中文名、标签位置与多边形，坐标保留 4 位小数。保持来源数据的范围与边界表达；用于概览对照，不是权威行政区划数据，不含港澳台或市县级区划。

行政区提取可复现：下载 Natural Earth 源 GeoJSON 后执行 `node scripts/extract-admin.mjs <源文件路径>`。所有地理数据使用 WGS84，与故事坐标一致。省名为现代名称，不随故事年份改变。

下载日期：2026-09-07。数据仅适用于概览，不代表历史海岸线、历史河道或精确测绘资料。
