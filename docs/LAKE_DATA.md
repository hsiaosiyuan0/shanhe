# 湖泊数据：来源、覆盖与核对

山河的湖泊底图使用 HydroLAKES v1.0；「水面核对」使用独立的 JRC 遥感观测。两者均随应用分发。它们表达不同的对象：前者是多源汇编的静态湖泊面，后者是水面出现频率，不能互相解释为某年的全湖边界。

## HydroLAKES

- [官方介绍与下载](https://www.hydrosheds.org/products/hydrolakes)、[技术说明](https://data.hydrosheds.org/file/technical-documentation/HydroLAKES_TechDoc_v10.pdf)。引用：Messager et al. (2016), *Nature Communications* 7:13603，CC BY 4.0。
- 官方文件：`HydroLAKES_polys_v10_shp.zip`，SHA-256：`9ef63498569dd7ccd0b8d8852da026e009a75f42d293f00e483f3b9fcfe8e1f9`。
- 以 75–135°E、15–54°N 为检索窗口，包含与窗口相交的 **44,492** 个完整水面要素，共 **1,570,301** 个坐标点。这是地理窗口，包含周边区域，不是国界裁切。
- 中国所在纬度范围的概略比例尺约 **1:25 万**。原始资料混合 SWBD、GRanD 等，不能把版本号或下载日期当作水面采集日期。目录的 `observationDate` 为 `null`。
- 保留源坐标、所有组成面、岛屿内洞和原始属性；没有平滑、补岸、合并或把分离水面相连。61 个源要素被 Shapely 判为拓扑无效，ID 已记录在 manifest；保留原始结构，未悄悄修复。这里的“保留”不等于对源数据精度背书。
- 210 个面积不小于 100 km² 的湖泊组成概览包，其余按 5°网格组织为 100 个包；按视野从缩放 6 起加载小湖泊。跨网格的完整湖面只分配一次，包范围覆盖其完整边界，避免湖岸在网格边缘被切断或重画。
- 每个文件以内容哈希命名，支持 gzip 与 HTTP 已解压两种响应，下载后验证 SHA-256；仅缓存最近使用的数据。构建时另记录每个要素的二进制坐标/环结构摘要。
- 基础目录有 373 个带名称要素，另有独立名称补充层（见下文）。基础中文对照在 `scripts/hydrolakes-names.json`；已有 Natural Earth 中文名只在明确空间对应后转用，保留 `ne_id` 与重叠率供审计，不使用其旧湖岸。发现的错误中文条目未转用。

### 湖泊与水库名称补充

HydroLAKES 的 `Lake_name` 只覆盖少数大湖及有资料的水库，不能单独用作地名库。现在保留原始要素属性与轮廓，通过独立的 `shared/data/lake-name-enrichment.json` 扩展地图标签、点击弹窗和模型 `search_lakes` 的名称/别名查询。

- [GDW v1.0 正式数据包](https://doi.org/10.6084/m9.figshare.25988293.v1)，CC BY 4.0，下载文件 `GDW_v1_0_shp.zip`。MD5 与作者发布值一致：`5064cf2315ef6159d9133b03596e761a`；SHA-256：`2fe0b367ed3fcfb299160cd9652b16a8a19338951026ee2ac91edfebf1f3b7ae`。优先通过 GRanD 编号连接，并要求 HydroLAKES 编号同时一致；非 GRanD 记录还要求 GDW 点位落在现有水面内。多坝共用同一水面、编号冲突的记录不自动采纳。
- [GeoNames 地名包](https://download.geonames.org/export/dump/readme.txt)，CC BY 4.0，2026-09-09 的 `CN.zip` 快照，SHA-256：`547e7e972084a0aa600512fa54c95e3fcf04166130a2f8f77898d9daf66e74c8`。只使用单个湖泊 `H.LK`、水库 `H.RSV` 点，不以附近村镇、坝址或复数湖群代替湖名。地名点须唯一落在一个有效水面面内，该水面也须只有一个候选地名点；多名冲突及已有中文名冲突写入 manifest，不就近套用。
- 中文标签使用源记录中文名称，或唯一中文别名；多个中文别名未任意挑选，仍可通过别名检索。地名点包含匹配是资料关联依据，不等于官方地名认证。原有已核对中文名优先保留。
- 可检索的名称/库区条目从 **373 增加到 3,510**，其中 **1,994 个中文名称**。**991 条仅有大坝名称**，明确显示为“某某 · 库区”，模型返回 `nameStatus: dam-associated`，不得将其冒充已确认的湖名。大量小水面仍缺名称；弹窗显示“名称待补充”，不会用所在县市补一个假名称。
- 截图中的 **HydroLAKES 15423 → GRanD 5566 → GDW 1723** 对应 Jinshuitan，结合[浙江地方资料](https://www.zjsjw.gov.cn/yixiankuaixun/201605/t20160520_2601658_ext.html)核对为**紧水滩水库，别名仙宫湖**。映射与资料入口记录在 `scripts/lake-name-overrides.json`，不是手工修改水面边界。
- 每条补充记录保存 `nameEvidence`（来源、原字段、编号、匹配方式、资料链接）与 `nameStatus`。弹窗默认展示简要说明，来源可展开，长网址改为可点击的文字链接。

`public/data/lake-names/` 保存 GDW 已用原字段、GeoNames 全部湖泊/水库点摘录、已匹配摘录及冲突清单。完整水面地名摘录也保留未匹配和冲突项；即便 GeoNames 日更新包发生变化，仍可重放这次匹配。GeoNames 与 GDW 均不能保证覆盖每个水面或所有中文名称。

```sh
python scripts/build-lake-names.py /path/to/GDW_v1_0_shp.zip /path/to/CN.zip
# 或使用已归档的 2026-09-09 水面地名摘录，重放同一结果：
python scripts/build-lake-names.py /path/to/GDW_v1_0_shp.zip public/data/lake-names/geonames-water.json.gz
```

### 两座重点湖泊

| 湖泊 | Hylak_id | 本次核查 |
| --- | --- | --- |
| 鄱阳湖 | 151 | 源记录名 Poyang，4,618 个坐标点、16 个环；原底图标为 Other，未提供具体采集日期。相比旧轮廓增加岸线和内洞细节，不代表实时水面。 |
| 洞庭湖 | 1470 | 源记录名 Dongting，面积属性 143.81 km²，仅覆盖局部。地图名称注明“局部”，模型返回 `coverage: partial`，严禁把该值当作全湖面积。 |

洞庭湖由东、南、西洞庭湖等部分组成，见[中科院资料](https://www.isa.cas.cn/kxcb/kpzw/202012/t20201221_5831495.html)。JRC 核对图可见该区域有大量超出 HydroLAKES 命名面范围的观测水面。这是覆盖差异，不以手工连岸来掩盖；周边独立水体保留原始编号，未全都冠以“洞庭湖”。

## JRC 离线水面核对

- [官方数据与版本说明](https://global-surface-water.appspot.com/download)，EC JRC/Google Global Surface Water **v1.5，1984–2024** 的 occurrence 图层。
- 原始格网约 30 米（0.00025°）；表达在长期观测中检测到水面的频率，值为 1–100%，0 不着色。它包括湖泊、河流、水库、季节性水域、洪泛及其他积水，不能据此判定某个湖泊的归属、完整边界或指定年份面积。
- 原始下载切片为 `occurrence_110E_30N_v1_5_2024.tif`，SHA-256：`a67a91d67d17576accb5374b6bbdda6763b4f191d61111e711cf50db465abe0d`。
- 两个检索窗口：鄱阳湖区域 `[115.65,28.6,116.85,29.9]`，洞庭湖区域 `[111.8,28.6,113.35,29.8]`。窗口是显示范围，不是湖界。
- `public/data/lake-reference/*-occurrence.tif` 保留原始像素裁片。显示图重投影为 EPSG:3857 的 **50 米**格网，采用最近邻，不插值生成新的频率值；以无损索引 PNG 着色，0 和无数据透明。PNG 四角使用重投影后的精确地理坐标。
- 开关默认关闭。开启后以遥感图替换湖泊面进行核对，保留地形、故事及行政区；只显示上述两个区域。图例始终标出时期、出现频率和“非当年湖岸”。开关随故事及快照保存，桌面与网页版一致。
- 官方说明新旧 Landsat 集合之间可能有配准偏移，近期更新并未套用原 2016 论文的完整验证。不能把 30 米像素大小写成“定位误差 30 米”，也不能将这张汇总图描述为某一年或丰水期的边界。

## 国内专题数据的获取进度

2026-09-09 已检查[鄱阳湖湖体时空分布数据集（1960s–2020）](https://www.geodata.cn/main/face_science_detail?guid=193039939438954&publisherGuid=29987510602686)，提供机构为中国科学院南京地理与湖泊研究所，14 个矢量文件、6.93 MB。

页面要求登录、填写用途、人工审核后下载，且列明用途限制。**尚未取得原始文件，未将其并入山河，也未声称完成该资料的几何校核。** 收到数据及使用条件后，可用于重点湖泊与具体年份的进一步核对。JRC 年/月切换也尚未实现，本次仅提供长期 occurrence 对照。

## 重新构建与验证

在临时 Python 环境安装 `pyshp==2.3.1 shapely==2.1.2 rasterio==1.4.3`（rasterio 可使用 Python 3.12 的 wheel），下载上述官方文件后，在项目根目录运行：

```sh
python scripts/build-hydrolakes.py /path/to/HydroLAKES_polys_v10_shp.zip
python scripts/build-lake-reference.py /path/to/occurrence_110E_30N_v1_5_2024.tif
python scripts/audit-lake-reference.py /path/to/occurrence_110E_30N_v1_5_2024.tif
npm test
npm run build
npm run build:pages
```

两条构建命令都校验原始文件哈希。测试检查所有要素的坐标与环摘要、分包唯一性、gzip 解码、哈希错误、取消请求、命名锚点、模型覆盖声明和开关持久化。PNG 的尺寸、内容哈希和地理配准写入 manifest。

模型先使用 `search_lakes` 获取来源、coverage 和可用 `reference`，再通过 `set_layers` / `set_view` 定位；`lakeReference` 开关需同时启用 `lakes`。当前未增加任意湖岸绘制或导入协议。
