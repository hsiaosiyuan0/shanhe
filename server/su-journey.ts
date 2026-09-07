import type { MapRoute, Story, StoryEvent } from '../shared/schema.js';

const museum = {
  title: '尧军：苏轼陆路出蜀路线考探 · 三苏祠博物馆',
  url: 'https://www.sscbwg.cn/suxueyanjiu/924.html',
};
const gazetteer = {
  title: '苏轼在汴十二年大事记 · 开封党史方志网',
  url: 'https://www.kfdsw.com/index/detail/id/2834.html',
};

export function suDeparture(): StoryEvent {
  return {
    id: 'su-1056',
    year: 1056,
    title: '出蜀赴京',
    place: '眉州',
    coordinates: [103.848, 30.075],
    description:
      '随父苏洵、弟苏辙首次赴汴京应考，整体以陆路北上出蜀，再东行入京。地图中的「赴京行程」按研究资料绘制概略走廊，秦岭支道和部分水陆转换仍待考；1057 年是登第年份。',
    category: 'travel',
    confidence: 'approximate',
    source: gazetteer,
  };
}

/** Modern approximate place locations, NOT sampled ancient road geometry.
 * The Qinling corridor follows Yao Jun's interpretation, not a scholarly consensus.
 * No navigation service, terrain shortest path or spline supplies historical evidence.
 */
export function suFirstJourney(): MapRoute {
  const stops: [string, [number, number], 'referenced' | 'inferred', string][] = [
    [
      '眉州 · 今眉山',
      [103.848, 30.075],
      'referenced',
      '家乡与出发地；这里记录的是 1056 年出行，不是出生年份。',
    ],
    ['成都', [104.067, 30.573], 'referenced', '方志记载此次离成都赴京。'],
    [
      '绵州 · 今绵阳',
      [104.735, 31.467],
      'inferred',
      '用于表达金牛道方向的概略参照点，不代表已证实停驻。',
    ],
    ['梓潼', [105.17, 31.643], 'inferred', '用于表达蜀中北行走廊，不代表已证实停驻。'],
    ['剑门关', [105.567, 32.213], 'referenced', '方志与路线研究均提及；坐标为今址附近概略定位。'],
    ['利州 · 今广元', [105.844, 32.435], 'inferred', '按金牛道方案安排，属于路线重建。'],
    [
      '三泉 · 今阳平关一带',
      [105.971, 32.976],
      'inferred',
      '采用尧军文中的三泉地望，标记为区域参照。',
    ],
    [
      '金牛驿 · 今大安一带',
      [106.239, 33.028],
      'inferred',
      '采用研究所述的金牛驿—陈平道方向；不是精确驿址。',
    ],
    [
      '兴州 · 今略阳',
      [106.154, 33.327],
      'inferred',
      '所选考证方案经此北行，不表示路线分歧已解决。',
    ],
    [
      '河池驿 · 今徽县一带',
      [106.087, 33.77],
      'inferred',
      '只定位地区；青泥岭、长举驿的具体线路与地望不在图上强定。',
    ],
    ['两当一带', [106.306, 33.912], 'inferred', '陈仓故道方案的概略控制点。'],
    ['凤州一带', [106.647, 34.032], 'inferred', '研究推定经由凤州北上，使用今址附近概略定位。'],
    [
      '大散关一带',
      [106.974, 34.224],
      'inferred',
      '关址本身亦有考证问题；只表达跨越秦岭的通道方向。',
    ],
    ['凤翔', [107.4, 34.521], 'referenced', '三苏祠文章所引年谱提及凤翔；线路仍为概略重建。'],
    ['长安 · 今西安', [108.94, 34.26], 'referenced', '开封方志列出的东行经地。'],
    ['渑池', [111.76, 34.77], 'referenced', '方志列为赴京经地；不要与 1061 年赴凤翔的再访混同。'],
    ['汴京 · 今开封', [114.307, 34.797], 'referenced', '1056 年到达京师备考；翌年登第。'],
  ];
  return {
    id: 'su-journey-1056',
    label: '1056 · 首次出蜀赴京',
    coordinates: stops.map(([, p]) => p),
    color: '#ad795a',
    approximate: true,
    journey: {
      startYear: 1056,
      endYear: 1056,
      fromEventId: 'su-1056',
      toEventId: 'su-1057',
      status: 'reconstructed',
      sources: [gazetteer, museum],
      summary:
        '这次是陆路赴京。图中选择「金牛道—陈仓故道」研究方案，以经过地区表达通道方向。秦岭段存在不同解释，沿嘉陵江有无兼用舟行也未确定；不是逐段查明的古道轨迹。1059 年经三峡、江陵再北上的水陆行程是另一次出行。',
      stops: stops.map(([label, , evidence, note], at) => ({ at, label, evidence, note })),
      legs: [
        {
          from: 0,
          to: 5,
          label: '蜀中北行 · 金牛道方向',
          mode: 'land',
          evidence: 'inferred',
          note: '陆路出蜀与经成都、剑门有资料依据；绵州、梓潼等点用于表达通道，不作为已证实停驻。',
        },
        {
          from: 5,
          to: 13,
          label: '秦岭段 · 陈仓故道方案',
          mode: 'unknown',
          evidence: 'unknown',
          note: '采用尧军所考路线方向；另有经阆中、褒斜的说法。徽县附近旧青泥道、驿址及嘉陵江沿线是否水陆并用均有待考处，灰色虚线表示未定段落。',
        },
        {
          from: 13,
          to: 16,
          label: '关中东行 · 入汴京',
          mode: 'land',
          evidence: 'inferred',
          note: '经凤翔、长安、渑池至汴京的方向有资料支持，地点之间的具体道路尚未复原。',
        },
      ],
    },
  };
}

/** Upgrade only the untouched legacy sample route. User edits never get overwritten. */
export function upgradeSuJourney(story: Story): Story | null {
  if (story.routes.some((r) => r.id === 'su-journey-1056')) return null;
  if (story.events.some((e) => e.id === 'su-1056')) return null;
  const legacy = story.routes.find((r) => r.id === 'su-route' && !r.journey);
  const fingerprint = [
    [103.848, 30.075],
    [114.307, 34.797],
    [107.4, 34.521],
    [120.155, 30.274],
    [119.41, 35.995],
    [117.284, 34.205],
    [120.088, 30.894],
    [114.873, 30.453],
    [120.155, 30.274],
    [114.416, 23.112],
    [109.576, 19.745],
    [119.974, 31.811],
  ];
  if (!legacy || JSON.stringify(legacy.coordinates) !== JSON.stringify(fingerprint)) return null;
  if (
    !story.events.some(
      (e) => e.id === 'su-1057' && e.coordinates[0] === 114.307 && e.coordinates[1] === 34.797,
    )
  )
    return null;
  const next = structuredClone(story);
  if (!next.events.some((e) => e.id === 'su-1056')) next.events.push(suDeparture());
  next.events.sort((a, b) => a.year - b.year);
  if (legacy.label === '东坡行迹 · 主要节点示意')
    next.routes.find((r) => r.id === 'su-route')!.label = '人生节点关系 · 不代表行程';
  next.routes.push(suFirstJourney());
  return next;
}
