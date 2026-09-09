import type { Story, MapAction } from './schema.js';
import { lakeCatalog } from './lakes.js';
import { lakeReference } from './lake-reference.js';

export function demo(story: Story, prompt: string): { content: string; actions: MapAction[] } {
  const actions: MapAction[] = [];
  let content =
    '当前是本地演示模式，还没有连接语言模型。你可以试试「标记主要山川」「显示旅途路线」或「开启三维地形」。在左下角的模型设置中连接支持工具调用的模型后，就能自由提问，并为任意故事生成事件与地图标记。';
  const firstJourney = story.routes.find((r) => r.id === 'su-journey-1056' && r.journey);
  if (/眉山|眉州|出蜀|赴京|汴京/.test(prompt) && firstJourney) {
    actions.push(
      { type: 'set_layers', layers: { ...story.layers, routes: true, connections: false } },
      { type: 'set_view', view: { center: [108.7, 33], zoom: 5, pitch: 0 } },
    );
    content =
      '1056 年首次赴京赶考，整体走陆路：从蜀中经剑门进入秦岭、关中，再东行至汴京；1057 年是登第年份。\n\n现在地图采用「金牛道—陈仓故道」的研究方案。秦岭支道有分歧，部分嘉陵江路段是否兼用舟行也未定，不能当作已查明的逐段道路。点击地图上方「行程」，可查看经过地区、待考段落和两份资料依据。\n\n1059 年再次赴京时，沿岷江、长江至江陵后转陆路北上，这是另一趟行程。';
  } else if (/核对|遥感/.test(prompt) && /湖|水面/.test(prompt)) {
    const enabled = !/关闭|隐藏|取消/.test(prompt);
    const area =
      lakeReference.images.find((a) => prompt.includes(a.label.replace('区域', ''))) ??
      lakeReference.images[0];
    actions.push({
      type: 'set_layers',
      layers: { ...story.layers, lakes: true, lakeReference: enabled },
    });
    if (enabled)
      actions.push({
        type: 'set_view',
        view: {
          center: [(area.bounds[0] + area.bounds[2]) / 2, (area.bounds[1] + area.bounds[3]) / 2],
          zoom: 7,
          pitch: 0,
        },
      });
    content = enabled
      ? `已打开${area.label}的 JRC 遥感水面核对。颜色表示 1984—2024 年观测中的水面出现频率，包含各类积水，不代表某年的湖岸或全湖范围。关闭「水面核对」可回到 HydroLAKES 轮廓。`
      : '已关闭遥感水面核对，恢复 HydroLAKES 湖泊轮廓。';
  } else if (/鄱阳湖|洞庭湖|太湖|洪泽湖|湖泊/.test(prompt)) {
    const enabled = !/关闭|隐藏|取消/.test(prompt);
    actions.push({ type: 'set_layers', layers: { ...story.layers, lakes: enabled } });
    const lake = lakeCatalog.find((l) => l.label && prompt.includes(l.label));
    if (enabled && lake)
      actions.push({
        type: 'set_view',
        view: { center: lake.center as [number, number], zoom: 7.5, pitch: 0 },
      });
    content = enabled
      ? `已显示${lake?.label || '湖泊'}的水面与名称。可在「图层 → 湖泊与水库」独立开关，点击水面查看来源。\n\n轮廓来自 HydroLAKES v1.0，保留原数据形状，属于现代地理参考；湖面会随季节、水位与年代变化，不代表故事年代的湖岸。${lake?.coverage === 'partial' ? '\n\n洞庭湖的命名要素仅代表局部水面，不能将其边界或面积解释为全湖。' : ''}`
      : '已隐藏湖泊与水库，河流图层保持原有设置。';
  } else if (/淮河|淮南|淮北/.test(prompt)) {
    actions.push(
      { type: 'set_layers', layers: { ...story.layers, rivers: true } },
      { type: 'set_view', view: { center: [117.116222, 32.837755], zoom: 6, pitch: 0 } },
    );
    content =
      '已定位到淮河。河道上会直接显示名称，也可以点击地图右上方「淮河」查看说明。\n\n地域称谓中的「淮南」「淮北」，以淮河的南北方位为参照，具体范围随语境与年代而变，不等同于今天的淮南市、淮北市。\n\n当前显示现代淮河干流及经洪泽湖向长江汇流的河段，湖区采用湖泊中心线，未完整收录入海分流。历史河道有过较大变化，不能把这张图直接当作古代河道。';
  } else if (/山川|山脉|河流|长江|黄河/.test(prompt)) {
    const places: [string, [number, number], 'mountain' | 'river', string][] = [
      ['秦岭', [107.8, 33.8], 'mountain', '中国中部重要山系。标记为山脉概略位置。'],
      ['大巴山', [108.3, 32.2], 'mountain', '四川盆地东北缘山系。标记为概略位置。'],
      ['庐山', [115.98, 29.57], 'mountain', '江西九江附近的山地。标记为现代地理参考。'],
      ['长江', [113.3, 29.6], 'river', '长江中游概略位置。地图河道采用现代小比例尺数据。'],
      ['黄河', [111.2, 35.9], 'river', '黄河中游概略位置，现代河道不能直接代表历史河道。'],
      [
        '淮河',
        [117.116222, 32.837755],
        'river',
        '淮河中游的现代地理参考，可对照理解地域称谓中的淮南、淮北。',
      ],
    ];
    for (const [label, coordinates, kind, description] of places)
      if (!story.markers.some((m) => m.label === label))
        actions.push({
          type: 'add_marker',
          marker: {
            id: crypto.randomUUID(),
            label,
            coordinates,
            kind,
            description,
            confidence: 'approximate',
          },
        });
    actions.push({
      type: 'set_layers',
      layers: { ...story.layers, rivers: true, mountains: true },
    });
    content =
      '已显示主要山川，并补充秦岭、大巴山、庐山、长江、黄河和淮河的概略标记。\n\n这些是现代地理参考；山脉标记代表大致位置，河流沿河道着色与标注。历史河道会发生变化，尤其不能把今天的黄河河道直接用于解释宋代事件。';
  } else if (/今地|行政区|省界|现代.*对照/.test(prompt)) {
    const enabled = !/关闭|隐藏|取消/.test(prompt);
    actions.push({ type: 'set_layers', layers: { ...story.layers, admin: enabled } });
    content = enabled
      ? '已打开今地对照：叠加现代省界和省名，点击地图可查看「今属」行政区。当前覆盖中国大陆省级范围，可再次点击右上角「今地对照」关闭。'
      : '已关闭现代行政区对照。';
  } else if (/三维|3D/i.test(prompt)) {
    const enabled = !/关闭|隐藏|取消/.test(prompt);
    actions.push(
      { type: 'set_layers', layers: { ...story.layers, terrain: enabled } },
      { type: 'set_view', view: { ...story.view, pitch: enabled ? 50 : 0 } },
    );
    content = enabled
      ? '已打开三维地形。放大地图可以观察山谷与地势；点击地图上的空白处，可以查看坐标和当前可用的高程估算。\n\n高程来自在线地形瓦片，是现代地表参考，并非历史地貌复原。'
      : '已关闭三维视角，回到平面地图。';
  } else if (/海拔|地形|分层|设色|高程/.test(prompt)) {
    const enabled = !/关闭|隐藏|取消/.test(prompt);
    actions.push({ type: 'set_layers', layers: { ...story.layers, elevation: enabled } });
    content = enabled
      ? '已打开海拔分层设色。绿色表示较低海拔，向黄色、棕色和灰白色逐渐升高，结合阴影可观察山脉、盆地与平原。地图图例给出对应高程。颜色来自现代高程数据，三维视角可以独立切换。'
      : '已关闭海拔分层设色，回到山川底图。';
  } else if (/路线|旅途|行迹/.test(prompt)) {
    if (story.kind !== 'travel') {
      const journeys = story.routes.filter((r) => r.journey);
      actions.push({
        type: 'set_layers',
        layers: { ...story.layers, routes: true, connections: false },
      });
      content = journeys.length
        ? `故事已整理 ${journeys.length} 段独立行程。点击地图上方「行程」查看路线、交通方式、经过地点和资料依据。人生事件之间可能有多次往返，不能直接连线当作实际旅途；其余行程仍待整理。`
        : '这个故事尚未整理有时间、经过地点和资料依据的独立行程。人物出现在两个地点，并不能证明其走法；当前演示不会据此生成一条古代道路。连接模型后可先整理待核验行程，或在图层中显式打开「地点连线（非行程）」查看地点关系。';
    } else if (story.events.length < 2)
      content =
        '这个故事还没有足够的地点。先添加至少两个带坐标的事件，就可以把它们按时间顺序连接成路线。';
    else {
      if (!story.routes.length)
        actions.push({
          type: 'add_route',
          route: {
            id: crypto.randomUUID(),
            label: '按时间连接的行迹示意',
            coordinates: [...story.events]
              .sort((a, b) => a.year - b.year)
              .map((e) => e.coordinates),
            color: '#ad795a',
            approximate: true,
          },
        });
      actions.push({ type: 'set_layers', layers: { ...story.layers, routes: true } });
      content = `已显示「${story.title}」的路线，按时间连接 ${story.events.length} 个主要节点。\n\n虚线表示节点之间的行迹示意，不代表经过考证的古代道路，也不能用作导航。点击时间线，可以逐段阅读这些地点背后的故事。`;
    }
  } else if (/黄州|赤壁|定风波/.test(prompt) && story.events.some((e) => e.id === 'su-1080')) {
    actions.push({ type: 'set_view', view: { center: [114.873, 30.453], zoom: 8, pitch: 0 } });
    if (!story.markers.some((m) => m.label === '东坡赤壁'))
      actions.push({
        type: 'add_marker',
        marker: {
          id: crypto.randomUUID(),
          label: '东坡赤壁',
          coordinates: [114.867, 30.453],
          kind: 'place',
          description:
            '今湖北黄冈的东坡赤壁，苏轼黄州文学的重要地理背景。并非通常所说的三国赤壁古战场。坐标为概略定位。',
          confidence: 'approximate',
        },
      });
    content =
      '黄州，是苏轼从困顿中重新安顿自己的地方。1080 年谪居黄州后，他躬耕东坡，自号「东坡居士」；1082 年写下《定风波》与前后《赤壁赋》。\n\n我已把地图移到黄州，并标记东坡赤壁。需要留意：文学中的黄州赤壁，与通常所说的三国赤壁古战场不是同一地点。';
  }
  return { content, actions };
}
