import { useRef, useState } from 'react';
import { Download, MapPin, Pencil, Plus, Trash2, Upload, Waves } from 'lucide-react';
import { z } from 'zod';
import { Button, Dialog, Disclosure, Input, Select, Switch, Textarea } from './ui';
import type { MapAction, Story } from '../shared/schema';
import { riverCatalog } from '../shared/river-catalog';
import {
  exportRiverGeoJSON,
  parseRiverGeoJSON,
  riverChannelSchema,
  riverLines,
  riverSummary,
  type RiverChannel,
  type RiverGeometry,
} from '../shared/rivers';

const periodLabels = { modern: '现代河道', historical: '历史河道', unknown: '年代待定' };
const colors = [
  { value: '#287e98', label: '江水蓝' },
  { value: '#786093', label: '烟紫' },
  { value: '#9a6d2a', label: '赭金' },
  { value: '#397461', label: '松绿' },
];
type Draft = Omit<RiverChannel, 'geometry'> & { geometry?: RiverGeometry };
const blank = (): Draft => ({
  id: crypto.randomUUID(),
  label: '',
  description: '',
  color: colors[0].value,
  visible: true,
  period: 'unknown',
  periodLabel: '',
  confidence: 'unverified',
});

function RiverPreview({ geometry, color }: { geometry: RiverGeometry; color: string }) {
  const lines = riverLines(geometry);
  const points = lines.flat();
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => -p[1]);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    right = Math.max(...xs),
    bottom = Math.max(...ys);
  const scale = Math.min(344 / (right - left || 1), 116 / (bottom - top || 1));
  const x = (n: number) => 180 + (n - (right + left) / 2) * scale;
  const y = (n: number) => 66 + (-n - (bottom + top) / 2) * scale;
  return (
    <svg
      className="river-preview"
      viewBox="0 0 360 132"
      role="img"
      aria-label={`河道几何预览，${lines.length} 个独立河段，不连接分段缺口`}
    >
      <defs>
        <pattern id="river-preview-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="360" height="132" fill="url(#river-preview-grid)" opacity="0.15" />
      {lines.map((line, i) => (
        <polyline
          key={i}
          points={line.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default function RiverManager({
  story,
  disabled,
  onApply,
  onLocate,
  onClose,
}: {
  story: Story;
  disabled: boolean;
  onApply: (actions: MapAction[]) => Promise<void>;
  onLocate: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [removed, setRemoved] = useState<RiverChannel | null>(null);
  const lock = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const blocked = working || disabled;
  const existing = story.riverChannels.find((r) => r.id === draft.id);
  const patch = (value: Partial<Draft>) => setDraft((d) => ({ ...d, ...value }));
  function fail(e: unknown) {
    setError(
      e instanceof z.ZodError
        ? `数据不符合要求：${e.issues[0]?.path.join('.')} · ${e.issues[0]?.message}`
        : e instanceof Error
          ? e.message
          : '无法读取数据',
    );
    requestAnimationFrame(() => alert.current?.focus());
  }
  async function run(work: () => Promise<void>) {
    if (lock.current || disabled) return;
    lock.current = true;
    setWorking(true);
    setError('');
    setNotice('');
    setRemoved(null);
    try {
      await work();
    } catch (e) {
      fail(e);
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  function load(text: string, filename = '') {
    if (new Blob([text]).size > 1024 * 1024) throw new Error('单次导入最多 1 MB，请先精简数据');
    const parsed = parseRiverGeoJSON(JSON.parse(text));
    const properties = parsed.properties;
    const fromFile = riverChannelSchema.safeParse({
      ...properties,
      id: draft.id,
      label:
        properties.label ||
        properties.name_zh ||
        properties.name ||
        filename.replace(/\.(geo)?json$/i, '') ||
        draft.label ||
        '未命名河道',
      geometry: parsed.geometry,
      confidence: 'unverified',
    });
    // Replacing a geometry invalidates the previous geometry's provenance.
    setDraft({
      ...(existing ? draft : fromFile.success ? fromFile.data : draft),
      geometry: parsed.geometry,
      source: fromFile.success ? fromFile.data.source : undefined,
      confidence: 'unverified',
    });
    setRaw('');
    setError('');
    setNotice('已读取河道，请核对预览、名称与年代后保存。');
  }
  async function save() {
    const river = riverChannelSchema.parse(draft);
    let action: MapAction;
    if (existing) {
      const changes: Record<string, unknown> = {};
      for (const key of Object.keys(river) as (keyof RiverChannel)[]) {
        if (key !== 'id' && JSON.stringify(river[key]) !== JSON.stringify(existing[key]))
          changes[key] = river[key];
      }
      if (!river.source && existing.source) changes.source = null;
      action = { type: 'update_river', id: river.id, patch: changes };
    } else action = { type: 'add_river', river };
    await onApply([
      action,
      ...(!story.layers.rivers
        ? [{ type: 'set_layers' as const, layers: { ...story.layers, rivers: true } }]
        : []),
    ]);
    setDraft(blank());
    setNotice(`${river.label}已保存到当前故事`);
  }
  function download(river: RiverChannel) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportRiverGeoJSON(river), null, 2)], {
        type: 'application/geo+json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${river.label}.geojson`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Dialog
      title="河道数据"
      description="给故事添一条河。选择已有数据，或导入自己的河道；名称、年代与来源会一起保存在故事中。"
      wide
      onClose={() => {
        if (!lock.current) onClose();
      }}
    >
      <div className="river-manager">
        <aside className="river-library">
          <div className="river-section-title">
            <h3>故事中的河道</h3>
            <span>{story.riverChannels.length} / 50</span>
          </div>
          <p className="river-hint">长江、黄河、淮河属于内置底图。这里管理额外添加的数据。</p>
          {!story.layers.rivers && (
            <p className="river-warning">河流总图层已关闭，保存或定位时会开启。</p>
          )}
          <div className="river-saved-list">
            {!story.riverChannels.length && (
              <div className="river-empty">
                <Waves size={26} />
                <p>还没有自定义河道</p>
                <small>从下方目录开始，或导入一份数据。</small>
              </div>
            )}
            {story.riverChannels.map((river) => (
              <div
                className={`river-saved-row ${draft.id === river.id ? 'selected' : ''}`}
                key={river.id}
              >
                <Button
                  className="river-saved-name"
                  aria-label={`编辑${river.label}`}
                  onClick={() => {
                    setDraft(structuredClone(river));
                    setError('');
                    setNotice('');
                  }}
                  disabled={blocked}
                >
                  <Waves size={17} style={{ color: river.color }} />
                  <span>
                    <strong>{river.label}</strong>
                    <small>
                      {periodLabels[river.period]} · {riverSummary(river).parts} 段
                    </small>
                  </span>
                  <Pencil size={13} />
                </Button>
                <div className="river-row-actions">
                  <Switch
                    aria-label={`显示${river.label}`}
                    checked={river.visible}
                    disabled={blocked}
                    onCheckedChange={(visible) =>
                      void run(async () => {
                        await onApply([{ type: 'update_river', id: river.id, patch: { visible } }]);
                        if (draft.id === river.id) patch({ visible });
                      })
                    }
                  />
                  <Button
                    title="在地图上定位"
                    aria-label={`定位${river.label}`}
                    disabled={blocked}
                    onClick={() =>
                      void run(async () => {
                        await onApply([
                          { type: 'update_river', id: river.id, patch: { visible: true } },
                          { type: 'set_layers', layers: { ...story.layers, rivers: true } },
                        ]);
                        onLocate(river.id);
                      })
                    }
                  >
                    <MapPin size={16} />
                  </Button>
                  <Button
                    title="导出 GeoJSON"
                    aria-label={`导出${river.label}`}
                    onClick={() => download(river)}
                  >
                    <Download size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="river-section-title river-catalog-title">
            <h3>从数据目录添加</h3>
            <span>现代参考</span>
          </div>
          <div className="river-catalog">
            {riverCatalog.map((river) => (
              <Button
                key={river.id}
                disabled={blocked}
                onClick={() => {
                  setDraft({ ...structuredClone(river), id: crypto.randomUUID() });
                  setError('');
                  setNotice('');
                }}
              >
                <Waves size={15} />
                <span>{river.label}</span>
                <Plus size={14} />
              </Button>
            ))}
          </div>
          <p className="river-hint">
            Natural Earth · 1:50m
            <br />
            保留原始河段，不补画数据缺口。
          </p>
        </aside>
        <section className="river-editor">
          <div className="river-section-title">
            <h3>{existing ? '编辑河道' : draft.geometry ? '核对并添加' : '导入你的河道'}</h3>
            <Button
              disabled={blocked}
              onClick={() => {
                setDraft(blank());
                setRaw('');
                setError('');
              }}
            >
              <Plus size={14} /> 新建
            </Button>
          </div>
          <div
            ref={alert}
            tabIndex={-1}
            role={error ? 'alert' : undefined}
            className={error ? 'form-error' : ''}
          >
            {error}
          </div>
          {draft.geometry ? (
            <>
              <RiverPreview geometry={draft.geometry} color={draft.color} />
              <p className="river-preview-caption">
                {riverLines(draft.geometry).length} 个河段 ·{' '}
                {riverLines(draft.geometry).flat().length.toLocaleString()} 个坐标点 · 几何预览
              </p>
            </>
          ) : (
            <div className="river-import-empty">
              <Waves size={32} />
              <strong>让河流沿着河道展开</strong>
              <span>
                支持 LineString / MultiLineString
                <br />
                以及包含河段的 Feature / FeatureCollection
              </span>
            </div>
          )}
          <Button
            className="river-import-button"
            disabled={blocked}
            onClick={() => upload.current?.click()}
          >
            <Upload size={16} />
            {draft.geometry ? '替换河道文件' : '选择 GeoJSON 文件'}
          </Button>
          <Input
            ref={upload}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file)
                void run(async () => {
                  if (file.size > 1024 * 1024) throw new Error('文件不能超过 1 MB');
                  load(await file.text(), file.name);
                });
            }}
          />
          <Disclosure title="或粘贴 GeoJSON" className="river-paste">
            <Textarea
              aria-label="GeoJSON 数据"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={5}
              placeholder={'{ "type": "Feature", "geometry": … }'}
              disabled={blocked}
            />
            <Button
              disabled={blocked || !raw.trim()}
              onClick={() => void run(async () => load(raw))}
            >
              读取数据
            </Button>
          </Disclosure>
          <p className="river-hint">
            WGS84 经纬度 · 单文件最多 1 MB / 8,000 点。一个文件作为一条河道导入，多段保持分离。
          </p>
          {draft.geometry && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(save);
              }}
            >
              <fieldset disabled={blocked}>
                <label>
                  河道名称
                  <Input
                    required
                    maxLength={100}
                    value={draft.label}
                    onChange={(e) => patch({ label: e.target.value })}
                    placeholder="如：汉江、黄河故道"
                  />
                </label>
                <div className="river-form-pair">
                  <label>
                    数据年代
                    <Select
                      disabled={blocked}
                      label="数据年代"
                      value={draft.period}
                      onValueChange={(period) => patch({ period: period as Draft['period'] })}
                      options={Object.entries(periodLabels).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </label>
                  <label>
                    河道颜色
                    <Select
                      disabled={blocked}
                      label="河道颜色"
                      value={draft.color}
                      onValueChange={(color) => patch({ color })}
                      options={
                        colors.some((c) => c.value === draft.color)
                          ? colors
                          : [...colors, { value: draft.color, label: `自定义 ${draft.color}` }]
                      }
                    />
                  </label>
                </div>
                {draft.period !== 'modern' && (
                  <label>
                    对应时期
                    <Input
                      maxLength={100}
                      value={draft.periodLabel}
                      onChange={(e) => patch({ periodLabel: e.target.value })}
                      placeholder="如：北宋时期，或具体测绘年份"
                    />
                  </label>
                )}
                <Disclosure title="说明与来源">
                  <label>
                    说明
                    <Textarea
                      rows={2}
                      maxLength={2000}
                      value={draft.description}
                      onChange={(e) => patch({ description: e.target.value })}
                      placeholder="数据覆盖范围、分辨率与不确定之处"
                    />
                  </label>
                  <label>
                    来源链接
                    <Input
                      type="url"
                      value={draft.source?.url || ''}
                      onChange={(e) =>
                        patch({
                          source: e.target.value
                            ? {
                                title: draft.source?.title || '用户提供的数据来源',
                                url: e.target.value,
                              }
                            : undefined,
                        })
                      }
                      placeholder="https://…（可选）"
                    />
                  </label>
                  {draft.source && (
                    <label>
                      来源名称
                      <Input
                        required
                        maxLength={200}
                        value={draft.source.title}
                        onChange={(e) =>
                          patch({ source: { ...draft.source!, title: e.target.value } })
                        }
                      />
                    </label>
                  )}
                </Disclosure>
                <p className="river-hint">
                  {draft.confidence === 'approximate'
                    ? '数据精度：区域尺度概略参考'
                    : '数据状态：待核验'}
                  。历史河道会显示年代说明，不随时间轴自动推定。
                </p>
                <div className="river-editor-actions">
                  <Button
                    type="submit"
                    className="primary-button"
                    disabled={blocked || !draft.geometry}
                  >
                    {working ? '正在保存…' : existing ? '保存修改' : '添加到故事'}
                  </Button>
                  {existing && (
                    <Button
                      type="button"
                      className="river-delete"
                      onClick={() =>
                        void run(async () => {
                          await onApply([{ type: 'remove_river', id: existing.id }]);
                          setDraft(blank());
                          setRemoved(existing);
                          setNotice(`${existing.label}已从故事移除`);
                        })
                      }
                    >
                      <Trash2 size={15} />
                      删除
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
        </section>
      </div>
      <p className="river-manager-status" role="status">
        {notice || '也可以对助手说：“添加汉江河道”，或让它调整已导入河道的颜色、说明与显示状态。'}
        {removed && (
          <Button
            disabled={blocked}
            onClick={() =>
              void run(async () => {
                await onApply([{ type: 'add_river', river: removed }]);
                setNotice(`${removed.label}已恢复`);
              })
            }
          >
            撤销删除
          </Button>
        )}
      </p>
    </Dialog>
  );
}
