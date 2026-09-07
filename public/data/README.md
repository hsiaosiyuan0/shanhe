# 地理数据

来自 [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector)，数据为[公共领域](https://www.naturalearthdata.com/about/terms-of-use/)。

- `land.geojson`：`ne_110m_land.geojson`，全球陆地轮廓，未包含国界。
- `rivers.geojson`：从 `ne_50m_rivers_lake_centerlines.geojson` 提取与 75–135°E / 15–54°N 区域相交的 80 条河流要素；保留 name、name_zh、scalerank 属性。另从 1:10m 数据补入 3 条淮河要素，共 83 条。
- `admin.geojson`：从 `ne_10m_admin_1_states_provinces.geojson` 提取 31 个中国大陆省级行政区（`adm0_a3=CHN`、`adm1_code` 以 `CHN-` 开头）。保留中文名、标签位置与多边形，坐标保留 4 位小数。保持来源数据的范围与边界表达；用于概览对照，不是权威行政区划数据，不含港澳台或市县级区划。

行政区提取可复现：下载 Natural Earth 源 GeoJSON 后执行 `node scripts/extract-admin.mjs <源文件路径>`。所有地理数据使用 WGS84，与故事坐标一致。省名为现代名称，不随故事年份改变。

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
