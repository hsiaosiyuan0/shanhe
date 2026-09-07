# 地理数据

来自 [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector)，数据为[公共领域](https://www.naturalearthdata.com/about/terms-of-use/)。

- `land.geojson`：`ne_110m_land.geojson`，全球陆地轮廓，未包含国界。
- `rivers.geojson`：从 `ne_50m_rivers_lake_centerlines.geojson` 提取与 75–135°E / 15–54°N 区域相交的 80 条河流要素；保留 name、name_zh、scalerank 属性。另从 1:10m 数据补入 3 条淮河要素，共 83 条。
- `admin.geojson`：从 `ne_10m_admin_1_states_provinces.geojson` 提取 31 个中国大陆省级行政区（`adm0_a3=CHN`、`adm1_code` 以 `CHN-` 开头）。保留中文名、标签位置与多边形，坐标保留 4 位小数。保持来源数据的范围与边界表达；用于概览对照，不是权威行政区划数据，不含港澳台或市县级区划。

行政区提取可复现：下载 Natural Earth 源 GeoJSON 后执行 `node scripts/extract-admin.mjs <源文件路径>`。所有地理数据使用 WGS84，与故事坐标一致。省名为现代名称，不随故事年份改变。

## 在线市县与地名

市县数据没有打包到此目录，而由 [OpenFreeMap](https://openfreemap.org/quick_start/) 的 `https://tiles.openfreemap.org/planet` TileJSON 提供，随当前视野加载。源数据为 [OpenStreetMap（ODbL）](https://www.openstreetmap.org/copyright)，使用 [OpenMapTiles schema](https://openmaptiles.org/schema/)。地图来源控件保留 OpenFreeMap、OpenMapTiles 和 OpenStreetMap 署名。

`boundary` 图层使用 `admin_level` 4 / 5 / 6 区分省、市、区县；`place` 图层优先使用 `name:zh-Hans`、`name:zh`，再回退 `name`。按 [OSM 中国区划约定](https://wiki.openstreetmap.org/wiki/China/Boundaries)，市县层级不能只看 `class=city`：区县政府所在地也可能采用该类型，因此用 `capital=6` 分出区县标签。地方数据可能存在缺漏，地图不承诺完整或权威的区划覆盖。

缩放 5 / 8 / 11 级分别启用城市、区县、乡镇地名；市界从 7 级、区县界从 8 级显示。源瓦片在 6–8 级未包含市县界，不能只调低样式 `minzoom`。在 7–8 级视角下，应用按视野请求第 9 级瓦片，提取 `boundary` 的真实线段为 GeoJSON；达到 9 级后改由原矢量源绘制。请求最多 6 路并发，缓存最近 192 个瓦片的边界几何；移动视角或关闭对照会取消旧请求。保留分段与原始顶点，不用城市中心连线推算边界。范围过大时提示放大，避免一次下载过多数据。

详细参考采用现代数据，不随故事年代变化，不替代历史行政区研究。`tests/fixtures/modern-admin-places.json` 保存了来源快照中杭州、眉山、武汉的少量真实地名记录。`admin-boundary-z8.pbf` 与 `admin-boundary-z9.pbf` 测试样本仅保留 `20260830_080001_pt/8/213/105.pbf` 和 `20260830_080001_pt/9/426/210.pbf` 中的原始 `boundary` 层（ODbL / OpenStreetMap），用于防止“地名出现但边界源实际为空”的回归。

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
