# 地理数据

来自 [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector)，数据为[公共领域](https://www.naturalearthdata.com/about/terms-of-use/)。

- `land.geojson`：`ne_110m_land.geojson`，全球陆地轮廓，未包含国界。
- `rivers.geojson`：从 `ne_50m_rivers_lake_centerlines.geojson` 提取与 75–135°E / 15–54°N 区域相交的 80 条河流要素；保留 name、name_zh、scalerank 属性。另从 1:10m 数据补入 3 条淮河要素，共 83 条。
- `lakes.geojson`：Natural Earth 1:10m 湖泊与水库，在相同区域按包围框相交提取的 192 个完整水面要素。

陆地与河流数据使用 WGS84。来源、比例尺与用途限制见下文。

## 行政区本地数据包

`admin/` 统一提供天地图下载的省、市、区县数据（2025 年 9 月版），34 / 375 / 2,891 个面要素。原始 EPSG:4490（CGCS2000）文件、独立境界线、版本元数据、SHA-256 和审计结果均保留。仅供地图可视化使用，坐标按区域尺度近似显示，不作测绘用途。

详见 [行政区数据说明](../../docs/ADMIN_DATA.md)，包含可复现构建、精度说明与源数据已知交叠。旧的 Natural Earth 省界、OSM 边界瓦片与 Overpass 轮廓已从运行逻辑移除；同级公共边界只画一次，悬停直接使用同包多边形。

11 级以后补充的乡镇、街区地名仍来自 [OpenFreeMap](https://openfreemap.org/quick_start/) 的 OpenStreetMap 矢量瓦片（[ODbL](https://www.openstreetmap.org/copyright)，[OpenMapTiles schema](https://openmaptiles.org/schema/)），仅作地名参考，不参与边界或悬停。地图来源控件保留署名。

## 河道

下载日期：2026-09-07。数据仅适用于概览，不代表历史海岸线、历史河道或精确测绘资料。

长江着色使用源数据中的 Tuotuo、Tongtian、Jinsha、Chang Jiang、Yangtze 河段，保留沱沱河、通天河、金沙江等分段名称；分段关系参考[中科院地理科学与资源研究所《长江》](https://www.igsnrr.cas.cn/cbkx/kpyd/zgdl/cnszy/202009/t20200910_5692425.html)。黄河着色覆盖所有 Huang 要素。显示沿用原河道几何，不跨数据缺口补直线，也不将支流并入干流。

## 淮河补充数据

原 1:50m 河流数据未收录淮河，补充来源为 Natural Earth [`ne_10m_rivers_lake_centerlines.geojson`](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_rivers_lake_centerlines.geojson)，固定版本 `ca96624a56bd078437bca8184e78163e5039ad19`。

提取源属性 `dissolve` 为 `458River`、`419River`、`419Lake Centerline` 的 3 条要素，共 7 段、386 个坐标。保留原坐标、分段与 River / Lake Centerline 类型，添加 `source_id`、`source_scale` 以便追溯。

源数据把部分中下游河段及湖泊中心线命名为 **Hudi**。我们依据它与 Huai 河段在 `[116.521414, 32.501247]` 的共用端点，以及经洪泽湖、高邮湖向扬州入江方向延伸的位置关系，将这部分在界面上归为“淮河”；这是对源数据名称的地理归并判断，原 `name` 属性仍保留。水系关系参考[中科院地理科学与资源研究所《淮河》](https://igsnrr.cas.cn/cbkx/kpyd/zgdl/cnszy/202009/t20200910_5692422.html)。

该补充呈现淮河干流及现代入江方向，湖区线为湖泊中心线，**未完整收录入海分流**。不跨缺口补线，不表示历史河道或完整淮河流域。

下载上述固定版本的源 GeoJSON 后，可重复执行（脚本校验源文件 Git blob SHA-1）：

```sh
node scripts/extract-huai.mjs <ne_10m_rivers_lake_centerlines.geojson>
```

## 湖泊与水库

来源为 [Natural Earth · Lakes + Reservoirs · 1:10m](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/) 的 [`ne_10m_lakes.geojson`](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_lakes.geojson)，固定版本 `ca96624a56bd078437bca8184e78163e5039ad19`。来源 CRS 为 OGC:CRS84，即 WGS84 经度、纬度顺序。

仅筛选与 75–135°E / 15–54°N 包围框相交的完整要素，不裁切、平滑、补画或连接湖岸，保留 Polygon / MultiPolygon 的所有环和内洞。`lakes-source/selected.geojson.gz` 归档所选要素的原始属性与几何，`manifest.json` 记录上游完整文件的 SHA-256 与提取结果哈希。该范围是地理窗口，不表示国界或归属。

鄱阳湖对应 `ne_id=1159114015`，洞庭湖对应 `1159116351`，沿用源名称；不与源数据另列的 `Po Hu` 混同。未命名水面保留形状，不编造名称。区域名称优先使用源 `name_zh`，标注点通过 polylabel 求取在水面内部。鄱阳湖、洞庭湖、太湖、洪泽湖的名称从缩放 4.5 开始显示，这是标注可见性调整，不改变源几何。

湖泊源数据经过概括，尤其在放大时不代表精细湖岸；不保证各湖水面的采集时间或水位一致，也不能用它表达实时水位、丰枯水期或古代水面。行政区、河道与湖岸来自不同数据集，不保证跨数据集端点严格贴合。

重新下载上述固定版本后运行：

```sh
node scripts/extract-lakes.mjs <ne_10m_lakes.geojson>
node --import tsx --test tests/lakes.test.ts
```

脚本检查完整源文件哈希，生成水面、目录与归档。测试逐要素比对源坐标与内洞，并验证标注点位于对应水面内部。模型的 `search_lakes` 返回名称、边界范围、内部标注点和来源，配合 `set_layers.lakes` / `set_view` 进行开关与定位。
