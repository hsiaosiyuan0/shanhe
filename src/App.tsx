import { browserMode, assetUrl } from './runtime';
import { useState, useEffect, useRef, useCallback, type FormEvent, type ReactNode } from 'react';
import {
  Mountain,
  Map,
  BookOpen,
  Plus,
  Search,
  Settings2,
  Compass,
  PanelRightClose,
  PanelRightOpen,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Layers3,
  Route,
  Waves,
  MapPin,
  Play,
  Pause,
  LocateFixed,
  Minus,
  Expand,
  Download,
  Upload,
  BookmarkPlus,
  History,
  Sparkles,
  SlidersHorizontal,
  Globe2,
  Feather,
  MoreHorizontal,
  Trash2,
  LoaderCircle,
  ExternalLink,
  Pencil,
  Library,
  Menu,
  CircleHelp,
  Square,
  Monitor,
  Plug,
} from 'lucide-react';
import type {
  Story,
  StoryDetail,
  StoryEvent,
  MapAction,
  Settings,
  Layers,
  Message,
} from '../shared/schema';
import { api, json, streamChat } from './api';
import AgentConnection from './AgentConnection';
import DesktopGuide from './DesktopGuide';
import MapCanvas, { type MapHandle } from './MapCanvas';
import { elevationGradient, elevationStops } from './map/elevation';
import JourneyPanel from './JourneyPanel';
import {
  ActionMenu,
  Button,
  Checkbox,
  Dialog,
  Input,
  RadioGroup,
  RadioItem,
  Select,
  Switch,
  Textarea,
} from './ui';

const kindLabels = { biography: '人物传记', history: '历史长卷', travel: '旅行手记' };
const categoryLabels = {
  life: '人生',
  career: '仕途',
  travel: '行旅',
  turning: '转折',
  culture: '人文',
};
const layerLabels: Record<keyof Layers, string> = {
  elevation: '海拔分层设色',
  admin: '现代行政区对照',
  terrain: '三维地形',
  rivers: '主要河流',
  mountains: '山脉与地貌',
  routes: '行程与路线',
  connections: '地点连线（非行程）',
};
const layerIcons = {
  elevation: Layers3,
  admin: Map,
  terrain: Mountain,
  rivers: Waves,
  mountains: MapPin,
  routes: Route,
  connections: Route,
};
type Modal = 'new' | 'settings' | 'snapshots' | 'marker' | 'event' | 'about' | 'desktop' | null;
type Point = { coordinates: [number, number]; elevation: number | null; modernRegion?: string };
function IconButton({
  label,
  children,
  onClick,
  className = '',
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      className={'icon-button ' + className}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

export default function App() {
  const [stories, setStories] = useState<Story[]>([]);
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [streamText, setStreamText] = useState('');
  const [agentStatus, setAgentStatus] = useState('');
  const [toolProgress, setToolProgress] = useState<string[]>([]);
  const [stopping, setStopping] = useState(false);
  const chatController = useRef<AbortController | null>(null);
  useEffect(() => () => chatController.current?.abort(), []);
  const [chatInput, setChatInput] = useState('');
  const [playing, setPlaying] = useState(false);
  const [showChat, setShowChat] = useState(() => !browserMode && window.innerWidth >= 1100);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<StoryEvent | undefined>();
  const mapRef = useRef<MapHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const activeId = useRef('');
  const timelineRef = useRef<HTMLDivElement>(null);
  const story = detail?.story;
  const selected = story?.events.find((e) => e.id === selectedId);
  const selectedIndex = story?.events.findIndex((e) => e.id === selectedId) ?? -1;
  const journeys = story?.routes.filter((r) => r.journey) || [];
  const activeRoute = journeys.find((r) => r.id === activeRouteId);
  const journeyModes = [...new Set(activeRoute?.journey?.legs.map((leg) => leg.mode) || [])];
  const flash = (message: string) => {
    setToast(message);
  };
  const updateDetail = (next: StoryDetail) => {
    setDetail(next);
    setStories((list) => list.map((s) => (s.id === next.story.id ? next.story : s)));
  };
  const updateStory = (next: Story) => {
    setDetail((current) =>
      current && current.story.id === next.id ? { ...current, story: next } : current,
    );
    setStories((list) => list.map((s) => (s.id === next.id ? next : s)));
  };
  const openStory = useCallback(async (id: string) => {
    const ticket = ++requestId.current;
    activeId.current = id;
    setLoading(true);
    setPlaying(false);
    setPoint(null);
    setShowLibrary(false);
    setError('');
    try {
      const result = await api<StoryDetail>('/stories/' + id);
      if (ticket !== requestId.current) return;
      setDetail(result);
      const journey = result.story.routes.find((r) => r.journey?.status === 'reconstructed');
      setActiveRouteId(journey?.id || null);
      setSelectedId(
        journey?.journey?.fromEventId ||
          result.story.events.find((e) => e.id === 'su-1080')?.id ||
          result.story.events[0]?.id ||
          '',
      );
      localStorage.setItem('shanhe-last-story', id);
    } catch (e) {
      if (ticket === requestId.current) setError((e as Error).message);
    } finally {
      if (ticket === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<Story[]>('/stories'),
      browserMode ? Promise.resolve(null) : api<Settings>('/settings'),
    ])
      .then(([list, config]) => {
        if (cancelled) return;
        setStories(list);
        setSettings(config);
        const id = localStorage.getItem('shanhe-last-story');
        if (list.length) void openStory(list.find((s) => s.id === id)?.id || list[0].id);
        else setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [openStory]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'end',
    });
  }, [detail?.messages.length, chatBusy, showChat, streamText, agentStatus, toolProgress]);
  useEffect(() => {
    timelineRef.current
      ?.querySelector(`[data-event-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedId]);
  useEffect(() => {
    if (!playing || !story?.events.length) return;
    const timer = setInterval(
      () =>
        setSelectedId((current) => {
          const index = story.events.findIndex((e) => e.id === current);
          if (index >= story.events.length - 1) {
            setPlaying(false);
            return current;
          }
          return story.events[index + 1].id;
        }),
      3000,
    );
    return () => clearInterval(timer);
  }, [playing, story?.events]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        setShowLayers(false);
        setShowMenu(false);
        setPoint(null);
        setShowLibrary(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const selectEvent = (id: string) => {
    setSelectedId(id);
    setPoint(null);
    setActiveRouteId(
      story?.routes.find((r) => r.journey?.fromEventId === id || r.journey?.toEventId === id)?.id ||
        null,
    );
  };
  useEffect(() => {
    setActiveRouteId((current) => {
      const matches = story?.routes.filter(
        (r) => r.journey?.fromEventId === selectedId || r.journey?.toEventId === selectedId,
      );
      return matches?.find((r) => r.id === current)?.id || matches?.[0]?.id || null;
    });
  }, [story?.id, selectedId]);
  const selectRoute = (id: string) => {
    setPlaying(false);
    setPoint(null);
    setActiveRouteId(id);
    const from = story?.routes.find((r) => r.id === id)?.journey?.fromEventId;
    if (from && story?.events.some((e) => e.id === from)) setSelectedId(from);
  };
  async function mutate(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const apply = async (actions: MapAction[]) => {
    if (!story) return;
    const next = await api<Story>(
      `/stories/${story.id}/actions`,
      json('POST', { revision: story.revision, actions }),
    );
    updateStory(next);
  };
  const toggleLayer = (key: keyof Layers) => {
    if (!story) return;
    void mutate(async () => {
      await apply([
        { type: 'set_layers', layers: { ...story.layers, [key]: !story.layers[key] } },
        ...(key === 'terrain'
          ? [
              {
                type: 'set_view' as const,
                view: {
                  ...(mapRef.current?.getView() || story.view),
                  pitch: story.layers.terrain ? 0 : 50,
                },
              },
            ]
          : []),
      ]);
    });
  };
  const sendChat = async (text = chatInput) => {
    if (!story || !text.trim() || chatBusy || busy) return;
    const id = story.id;
    setChatBusy(true);
    setPendingPrompt(text);
    setStreamText('');
    setAgentStatus('正在准备故事上下文…');
    setToolProgress([]);
    setStopping(false);
    const controller = new AbortController();
    chatController.current = controller;
    setChatInput('');
    setError('');
    try {
      const next = await streamChat(
        id,
        { prompt: text, revision: story.revision },
        (event) => {
          if (activeId.current !== id) return;
          if (event.type === 'text') setStreamText(event.text);
          if (event.type === 'status') setAgentStatus(event.text);
          if (event.type === 'tool')
            setToolProgress((list) =>
              [...list.filter((t) => t !== event.text), event.text].slice(-4),
            );
        },
        controller.signal,
      );
      if (activeId.current === id) {
        updateDetail(next);
        const addedJourney = next.story.routes.find(
          (route) => route.journey && !story.routes.some((existing) => existing.id === route.id),
        );
        if (addedJourney) {
          setPlaying(false);
          setPoint(null);
          setActiveRouteId(addedJourney.id);
          const from = addedJourney.journey?.fromEventId;
          if (from && next.story.events.some((event) => event.id === from)) setSelectedId(from);
        }
        flash('对话与地图修改已保存');
      } else setStories((list) => list.map((s) => (s.id === id ? next.story : s)));
    } catch (e) {
      if (activeId.current === id) {
        // Resolve a stop/disconnect racing the final commit against SQLite.
        try {
          const latest = await api<StoryDetail>(`/stories/${id}`);
          updateDetail(latest);
          if (latest.story.revision > story.revision && latest.messages.at(-2)?.content === text) {
            flash('对话已完成并保存');
          } else if (controller.signal.aborted || (e as Error).message.startsWith('已停止')) {
            setChatInput(text);
            flash('已停止，本轮未保存');
          } else {
            setChatInput(text);
            setError((e as Error).message);
          }
        } catch {
          setChatInput(text);
          setError('连接中断，请刷新确认保存状态后再重试。');
        }
      }
    } finally {
      chatController.current = null;
      setChatBusy(false);
      setStopping(false);
      setPendingPrompt('');
    }
  };
  const snapshot = () =>
    void mutate(async () => {
      if (!story) return;
      const view = mapRef.current?.getView();
      if (view) {
        const next = await api<Story>(`/stories/${story.id}`, json('PUT', { ...story, view }));
        updateStory(next);
      }
      await api(
        `/stories/${story.id}/snapshots`,
        json('POST', {
          name: `${story.title} · ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
        }),
      );
      updateDetail(await api<StoryDetail>(`/stories/${story.id}`));
      flash('已保存当前地图、故事与对话的快照');
    });
  const exportStory = () =>
    void mutate(async () => {
      if (!story) return;
      const data = await api(`/stories/${story.id}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = story.title + '.shanhe.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setShowMenu(false);
      flash('故事已导出，包含事件、标记、路线和对话');
    });
  const importStory = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      setError('请选择小于 3 MB 的山河 JSON 文件');
      return;
    }
    await mutate(async () => {
      const data = JSON.parse(await file.text());
      const next = await api<Story>('/import', json('POST', data));
      setStories((list) => [...list, next]);
      await openStory(next.id);
      flash('故事已导入');
    });
  };
  const filtered = stories.filter(
    (s) =>
      (filter === 'all' || (filter === 'history' ? s.kind !== 'travel' : s.kind === 'travel')) &&
      s.title.toLowerCase().includes(query.toLowerCase()),
  );
  const disableEdit = busy || chatBusy;

  return (
    <div
      className={
        'app ' +
        (browserMode ? 'browser-edition ' : '') +
        (!showChat || browserMode ? 'chat-hidden ' : '') +
        (showLibrary ? 'library-open' : '')
      }
    >
      <nav className="rail" aria-label="主导航">
        <a className="brand-symbol" href={assetUrl('')} aria-label="山河首页">
          <img src={assetUrl('icon.svg')} width="38" height="38" alt="" />
        </a>
        <div className="rail-nav">
          <IconButton
            label="故事地图"
            className="rail-active"
            onClick={() => setShowLibrary((v) => !v)}
          >
            <Map size={22} />
          </IconButton>
          <IconButton
            label="我的故事"
            onClick={() => {
              setFilter('all');
              setShowLibrary(true);
              document.getElementById('story-search')?.focus();
            }}
          >
            <Library size={21} />
          </IconButton>
          <IconButton label="保存的版本" onClick={() => setModal('snapshots')}>
            <History size={21} />
          </IconButton>
        </div>
        <div className="rail-bottom">
          <IconButton label="关于山河" onClick={() => setModal('about')}>
            <CircleHelp size={20} />
          </IconButton>
          {browserMode ? (
            <IconButton label="桌面版安装指引" onClick={() => setModal('desktop')}>
              <Monitor size={21} />
            </IconButton>
          ) : (
            <IconButton label="模型设置" onClick={() => setModal('settings')}>
              <Settings2 size={21} />
            </IconButton>
          )}
          <div className="avatar" title={browserMode ? '浏览器工作空间' : '本地工作空间'}>
            山
          </div>
        </div>
      </nav>
      {showLibrary && (
        <Button
          className="library-scrim"
          aria-label="关闭故事库"
          onClick={() => setShowLibrary(false)}
        />
      )}
      <aside className="library">
        <div className="brand-wordmark">
          <span>山河</span>
          <small>STORY ATLAS</small>
        </div>
        <div className="library-title">
          <h2>我的故事</h2>
          <span>{stories.length.toString().padStart(2, '0')}</span>
          <IconButton label="导入故事" onClick={() => importRef.current?.click()}>
            <Upload size={16} />
          </IconButton>
        </div>
        <Button className="new-story" onClick={() => setModal('new')}>
          <Plus size={18} /> 开启一个新故事 <span>⌘</span>
        </Button>
        <label className="search-field">
          <Search size={15} />
          <Input
            id="story-search"
            aria-label="搜索故事"
            placeholder="寻找一个故事…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌕</kbd>
        </label>
        <div className="library-filters">
          {[
            ['all', '全部'],
            ['history', '历史'],
            ['travel', '旅行'],
          ].map(([value, label]) => (
            <Button
              key={value}
              onClick={() => setFilter(value)}
              className={filter === value ? 'active' : ''}
              aria-pressed={filter === value}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="story-list">
          {filtered.map((s) => (
            <Button
              key={s.id}
              className={'story-tile ' + (story?.id === s.id ? 'active' : '')}
              onClick={() => void openStory(s.id)}
              disabled={chatBusy || busy}
            >
              <div className={'story-art ' + s.kind}>
                <span className="art-mountain one" />
                <span className="art-mountain two" />
                <span className="art-river" />
                {s.kind === 'biography' ? (
                  <Feather size={19} />
                ) : s.kind === 'history' ? (
                  <BookOpen size={19} />
                ) : (
                  <Compass size={19} />
                )}
              </div>
              <div className="story-tile-body">
                <span className="story-kind">{kindLabels[s.kind]}</span>
                <h3>{s.title}</h3>
                <small>{s.era}</small>
              </div>
              {story?.id === s.id && <span className="active-dot" />}
            </Button>
          ))}
          {!filtered.length && (
            <p className="muted empty-filter">
              没有找到故事。
              <br />
              试试换个名字，或开始一个新的。
            </p>
          )}
        </div>
        <div className="library-note">
          <div className="note-heading">
            <Compass size={17} />
            <span>故事不止一条路</span>
          </div>
          <p>
            跟随一个人，走进一个时代，
            <br />
            或只是去看看山的那一边。
          </p>
          <Button
            onClick={() => {
              setModal('new');
            }}
          >
            从灵感开始 <ArrowUpRight size={14} />
          </Button>
        </div>
        <div className="library-footer">
          <span className="online-dot" />
          <div>
            <strong>{browserMode ? '浏览器工作空间' : '本地工作空间'}</strong>
            <small>{browserMode ? '仅保存在当前浏览器' : '故事保存在这台设备'}</small>
          </div>
          <IconButton label="工作空间信息" onClick={() => setModal('about')}>
            <SlidersHorizontal size={16} />
          </IconButton>
        </div>
      </aside>

      <header className="topbar">
        <div className="breadcrumb">
          <IconButton
            label="展开故事库"
            className="mobile-menu"
            onClick={() => setShowLibrary((v) => !v)}
          >
            <Menu size={20} />
          </IconButton>
          <BookOpen size={16} />
          <span>我的故事</span>
          <ChevronRight size={14} />
          <strong>{story?.title || '新的旅程'}</strong>
        </div>
        <div className="topbar-actions">
          <span className="save-status">
            <span className="online-dot" />
            {disableEdit ? '正在处理…' : browserMode ? '已保存到浏览器' : '已保存到本地'}
          </span>
          <Button
            aria-label="保存快照"
            className="subtle-button snapshot-button"
            onClick={snapshot}
            disabled={!story || disableEdit}
          >
            <BookmarkPlus size={16} />
            <span>保存快照</span>
          </Button>
          <ActionMenu
            open={showMenu}
            onOpenChange={setShowMenu}
            trigger={
              <Button className="icon-button" aria-label="故事操作">
                <MoreHorizontal size={20} />
              </Button>
            }
            items={[
              {
                label: '导出完整故事',
                icon: <Download size={16} />,
                disabled: !story || disableEdit,
                onSelect: exportStory,
              },
              {
                label: '版本记录',
                icon: <History size={16} />,
                onSelect: () => setModal('snapshots'),
              },
              {
                label: '导入故事',
                icon: <Upload size={16} />,
                onSelect: () => importRef.current?.click(),
              },
            ]}
          />
          <span className="header-divider" />
          {browserMode ? (
            <Button className="desktop-entry" onClick={() => setModal('desktop')}>
              <Monitor size={16} aria-hidden="true" />
              使用桌面版
            </Button>
          ) : (
            <IconButton
              label={showChat ? '收起探索助手' : '展开探索助手'}
              onClick={() => setShowChat((v) => !v)}
            >
              {showChat ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
            </IconButton>
          )}
        </div>
      </header>

      <main className="workspace">
        {loading ? (
          <div className="workspace-loading">
            <LoaderCircle className="spin" size={28} />
            <span>正在铺开山河…</span>
          </div>
        ) : story ? (
          <>
            <section className="story-heading">
              <div>
                <div className="eyebrow">
                  <span className="edition">
                    STORY {String(stories.findIndex((s) => s.id === story.id) + 1).padStart(2, '0')}
                  </span>
                  <span className="eyebrow-line" />
                  {kindLabels[story.kind]}
                </div>
                <div className="title-row">
                  <h1>{story.title}</h1>
                  <span className="era-tag">
                    {story.kind === 'travel' ? '在路上' : story.era.split(' · ')[0]}
                  </span>
                </div>
                <p>
                  {story.subtitle}
                  <span className="subtitle-context">
                    <span className="subtitle-divider">/</span>
                    {story.kind === 'biography'
                      ? '循着足迹，与千年前的灵魂相逢'
                      : story.kind === 'history'
                        ? '沿着时间，读懂山河的变迁'
                        : '让每一处风景，成为故事的一页'}
                  </span>
                </p>
              </div>
              <div className="story-stats">
                <div>
                  <strong>{story.events.length}</strong>
                  <span>
                    {story.kind === 'biography'
                      ? '人生节点'
                      : story.kind === 'travel'
                        ? '旅途节点'
                        : '历史事件'}
                  </span>
                </div>
                <div>
                  <strong>{new Set(story.events.map((e) => e.place)).size}</strong>
                  <span>地理坐标</span>
                </div>
              </div>
            </section>
            <section className="map-section" aria-label="地图探索">
              <MapCanvas
                ref={mapRef}
                key={story.id}
                story={story}
                selected={selected}
                activeRouteId={activeRouteId}
                onSelect={selectEvent}
                onSelectRoute={selectRoute}
                onPoint={setPoint}
              />
              <div className="map-top">
                <div className="map-mode">
                  <span className="online-dot" />
                  <span>
                    {story.layers.terrain
                      ? '三维地形'
                      : story.layers.elevation
                        ? '分层设色'
                        : '山川底图'}
                  </span>
                  <span className="map-mode-divider" />
                  现代地理参考
                </div>
                <div className="map-tools">
                  <Button
                    aria-label="查看行程依据"
                    title={
                      journeys.length
                        ? '查看经过地点、交通方式与资料依据'
                        : '尚未整理独立行程，地点关系不代表实际旅途'
                    }
                    onClick={() => selectRoute(journeys[0].id)}
                    disabled={!journeys.length}
                    className={activeRoute ? 'active' : ''}
                  >
                    <Route size={15} />
                    <span>行程</span>
                  </Button>
                  <Button
                    aria-label="现代行政区对照"
                    title="叠加现代省界与省名，点击地图查看所属行政区"
                    aria-pressed={story.layers.admin}
                    className={story.layers.admin ? 'active admin-toggle' : 'admin-toggle'}
                    onClick={() => toggleLayer('admin')}
                    disabled={disableEdit}
                  >
                    <Map size={15} />
                    <span>今地对照</span>
                  </Button>
                  <Button
                    aria-label="地图图层"
                    className={showLayers ? 'active' : ''}
                    onClick={() => setShowLayers((v) => !v)}
                    aria-expanded={showLayers}
                  >
                    <Layers3 size={16} />
                    <span>图层</span>
                    <span className="layer-count">
                      {Object.values(story.layers).filter(Boolean).length}
                    </span>
                  </Button>
                  <Button
                    onClick={() =>
                      void mutate(async () => {
                        await apply([
                          {
                            type: 'set_layers',
                            layers: { ...story.layers, terrain: !story.layers.terrain },
                          },
                          {
                            type: 'set_view',
                            view: {
                              ...(mapRef.current?.getView() || story.view),
                              pitch: story.layers.terrain ? 0 : 50,
                            },
                          },
                        ]);
                      })
                    }
                    disabled={disableEdit}
                    className={story.layers.terrain ? 'active' : ''}
                    aria-label="三维地形"
                    aria-pressed={story.layers.terrain}
                  >
                    3D
                  </Button>
                </div>
              </div>
              {showLayers && (
                <div className="layer-panel">
                  <div className="layer-panel-title">
                    <span>地图图层</span>
                    <IconButton label="关闭图层" onClick={() => setShowLayers(false)}>
                      <X size={14} />
                    </IconButton>
                  </div>
                  {(Object.keys(layerLabels) as (keyof Layers)[]).map((key) => {
                    const Icon = layerIcons[key];
                    return (
                      <label key={key} className="layer-row">
                        <Icon size={17} aria-hidden="true" />
                        <span>{layerLabels[key]}</span>
                        <Switch
                          checked={story.layers[key]}
                          onCheckedChange={() => toggleLayer(key)}
                          disabled={disableEdit}
                          aria-label={layerLabels[key]}
                        />
                      </label>
                    );
                  })}
                  <p>海拔颜色与三维视角可独立切换。省界为现代参考，未加载历史疆界。</p>
                </div>
              )}
              <div className="map-compass" aria-hidden="true">
                <span>N</span>
                <div>↑</div>
              </div>
              {activeRoute && !point && (
                <JourneyPanel
                  route={activeRoute}
                  routes={journeys}
                  onChange={selectRoute}
                  onFocus={(leg) => mapRef.current?.focusRoute(activeRoute.id, leg)}
                  onClose={() => {
                    setActiveRouteId(null);
                    mapRef.current?.fit();
                  }}
                />
              )}
              {selected && !point && !activeRoute && (
                <article className="event-detail" key={selected.id}>
                  <div className="event-detail-top">
                    <span className={'category-dot ' + selected.category} />
                    <span>{categoryLabels[selected.category]}</span>
                    <span className="detail-number">
                      {String(selectedIndex + 1).padStart(2, '0')} /{' '}
                      {String(story.events.length).padStart(2, '0')}
                    </span>
                    <IconButton
                      label="编辑当前事件"
                      onClick={() => {
                        setEditingEvent(selected);
                        setModal('event');
                      }}
                      disabled={disableEdit}
                    >
                      <Pencil size={13} />
                    </IconButton>
                  </div>
                  <div className="event-detail-title">
                    <h2>{selected.title}</h2>
                    <span>
                      {story.kind === 'travel' ? `DAY ${selected.year}` : `${selected.year} 年`}
                    </span>
                  </div>
                  <p className="event-description">{selected.description}</p>
                  {selected.quote && <blockquote>「{selected.quote}」</blockquote>}
                  <div className="event-detail-footer">
                    <span>
                      <MapPin size={12} />
                      {selected.place} · 概略定位
                    </span>
                    {selected.source ? (
                      <a
                        href={selected.source.url}
                        target="_blank"
                        rel="noreferrer"
                        title={selected.source.title}
                      >
                        参考资料 <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span>待核验</span>
                    )}
                  </div>
                </article>
              )}
              {point && (
                <div className="point-card">
                  <div>
                    <strong>在这里，添一笔</strong>
                    <IconButton label="关闭坐标信息" onClick={() => setPoint(null)}>
                      <X size={15} />
                    </IconButton>
                  </div>
                  <p>
                    {point.coordinates[1].toFixed(4)}° N &nbsp; {point.coordinates[0].toFixed(4)}° E
                  </p>
                  {point.modernRegion && (
                    <p className="point-region">今属 · {point.modernRegion}</p>
                  )}
                  <small>
                    {point.elevation === null
                      ? '开启三维地形并放大，可查询高程'
                      : `地表高程 ≈ ${point.elevation} m · 数据估算`}
                  </small>
                  <Button
                    className="primary-button"
                    onClick={() => setModal('marker')}
                    disabled={disableEdit}
                  >
                    <Plus size={15} />
                    添加地点标记
                  </Button>
                </div>
              )}
              <div className="map-controls">
                <IconButton label="放大地图" onClick={() => mapRef.current?.zoom(1)}>
                  <Plus size={18} />
                </IconButton>
                <IconButton label="缩小地图" onClick={() => mapRef.current?.zoom(-1)}>
                  <Minus size={18} />
                </IconButton>
                <span />
                <IconButton
                  label="查看完整路线"
                  onClick={() =>
                    activeRoute ? mapRef.current?.focusRoute(activeRoute.id) : mapRef.current?.fit()
                  }
                >
                  <Expand size={17} />
                </IconButton>
                <IconButton
                  label="定位当前事件"
                  onClick={() => {
                    if (selected)
                      void mutate(() =>
                        apply([
                          {
                            type: 'set_view',
                            view: {
                              center: selected.coordinates,
                              zoom: 7,
                              pitch: story.view.pitch,
                            },
                          },
                        ]),
                      );
                  }}
                  disabled={!selected || disableEdit}
                >
                  <LocateFixed size={17} />
                </IconButton>
              </div>
              <div className="map-legend">
                {story.layers.routes &&
                  journeyModes.map((mode) => (
                    <span className="legend-journey-item" key={mode}>
                      <i className={`legend-${mode}`} />
                      {{ land: '陆路走廊', water: '水路走廊', unknown: '待考路段' }[mode]}
                    </span>
                  ))}
                {story.layers.routes &&
                  !activeRoute &&
                  (story.kind === 'travel' || story.layers.connections) && (
                    <>
                      <span className="legend-route" />
                      {story.kind === 'travel' ? '旅行规划示意' : '地点连线 · 非行程'}
                    </>
                  )}
                {!activeRoute && (
                  <>
                    <span className="legend-pin" />
                    事件地点
                  </>
                )}
              </div>
              {story.layers.elevation && (
                <div
                  className="elevation-legend"
                  aria-label="海拔图例，单位米，从绿色低海拔到棕色、灰白色高海拔"
                >
                  <div className="elevation-legend-heading">
                    <span>
                      海拔 <small>m</small>
                    </span>
                    <span>低海拔 → 高海拔</span>
                  </div>
                  <div className="elevation-ramp" style={{ background: elevationGradient }} />
                  <div className="elevation-ticks">
                    {elevationStops.map(([height]) => (
                      <span key={height}>{height >= 1000 ? `${height / 1000}k` : height}</span>
                    ))}
                  </div>
                </div>
              )}
              {story.layers.admin && (
                <div className="admin-caption">
                  <span />
                  现代省界 · 中国大陆
                </div>
              )}
            </section>
            <section className="timeline">
              <div className="timeline-heading">
                <div>
                  <History size={16} />
                  <h2>时光长卷</h2>
                  <span>
                    {story.kind === 'travel'
                      ? `${story.events.length} 个旅途节点`
                      : story.events.length
                        ? `${story.events[0].year} — ${story.events.at(-1)!.year}`
                        : '等待第一个事件'}
                  </span>
                </div>
                <div className="timeline-actions">
                  <Button
                    aria-label="添加事件"
                    className="text-button"
                    onClick={() => {
                      setEditingEvent(undefined);
                      setModal('event');
                    }}
                    disabled={disableEdit}
                  >
                    <Plus size={14} />
                    <span>添加事件</span>
                  </Button>
                  <div className="play-controls">
                    <IconButton
                      label="上一个事件"
                      onClick={() => selectEvent(story.events[Math.max(0, selectedIndex - 1)].id)}
                      disabled={selectedIndex <= 0}
                    >
                      <ChevronLeft size={16} />
                    </IconButton>
                    <IconButton
                      label={playing ? '暂停播放' : '播放时间线'}
                      className="play-button"
                      onClick={() => {
                        if (!playing && selectedIndex === story.events.length - 1)
                          setSelectedId(story.events[0].id);
                        setPlaying((v) => !v);
                      }}
                      disabled={!story.events.length}
                    >
                      {playing ? (
                        <Pause size={13} fill="currentColor" />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                    </IconButton>
                    <IconButton
                      label="下一个事件"
                      onClick={() =>
                        selectEvent(
                          story.events[Math.min(story.events.length - 1, selectedIndex + 1)].id,
                        )
                      }
                      disabled={selectedIndex >= story.events.length - 1}
                    >
                      <ChevronRight size={16} />
                    </IconButton>
                  </div>
                </div>
              </div>
              <div className="timeline-track" ref={timelineRef}>
                {story.events.map((e, i) => (
                  <Button
                    key={e.id}
                    data-event-id={e.id}
                    className={
                      'timeline-event ' +
                      (selectedId === e.id ? 'selected ' : '') +
                      (i < selectedIndex ? 'past' : '')
                    }
                    onClick={() => selectEvent(e.id)}
                    aria-pressed={selectedId === e.id}
                  >
                    <span className="event-year">
                      {story.kind === 'travel' ? `DAY ${e.year}` : e.year}
                      <span>{story.kind !== 'travel' ? '年' : ''}</span>
                    </span>
                    <span className="timeline-line">
                      <span className={'timeline-dot ' + e.category} />
                    </span>
                    <strong>{e.title}</strong>
                    <small>
                      <MapPin size={10} />
                      {e.place}
                    </small>
                  </Button>
                ))}
                {!story.events.length && (
                  <Button
                    className="empty-timeline"
                    onClick={() => {
                      setEditingEvent(undefined);
                      setModal('event');
                    }}
                  >
                    <Plus size={20} />
                    <span>添加第一个事件，让故事有一个起点</span>
                  </Button>
                )}
              </div>
              <div className="timeline-footer">
                <span>
                  <span className="mini-dot" />
                  点击节点，回到故事发生的地方
                </span>
                <span>按事件排列 · 非等距年表</span>
              </div>
            </section>
          </>
        ) : (
          <div className="empty-workspace">
            <Mountain size={52} strokeWidth={1} />
            <h1>每段故事，都有山河</h1>
            <p>创建你的第一个故事，从一处地点开始。</p>
            <Button className="primary-button" onClick={() => setModal('new')}>
              <Plus size={17} />
              开启一个新故事
            </Button>
          </div>
        )}
      </main>

      {!browserMode && (
        <aside className="assistant-panel">
          <div className="assistant-heading">
            <div className="assistant-symbol">
              <Sparkles size={17} />
            </div>
            <div>
              <h2>与山河对话</h2>
              <span>让好奇心，带你走得更远</span>
            </div>
            <IconButton label="收起探索助手" onClick={() => setShowChat(false)}>
              <PanelRightClose size={18} />
            </IconButton>
          </div>
          <Button
            className="context-strip"
            onClick={() => {
              if (story) flash(`当前对话会参考「${story.title}」中的全部事件、标记与路线`);
            }}
          >
            <span>
              <BookOpen size={13} />
              当前故事上下文
            </span>
            <span>
              {story ? `${story.events.length} 个事件` : '未选择故事'}
              <Check size={13} />
            </span>
          </Button>
          <div className="chat-scroll">
            <div className="assistant-intro">
              <span className="intro-eyebrow">A LITTLE CURIOSITY, A BIG WORLD</span>
              <h3>
                {story?.kind === 'biography' ? (
                  <>
                    文字之外，
                    <br />
                    还有一整个山河。
                  </>
                ) : (
                  <>
                    展开地图，
                    <br />
                    让故事继续。
                  </>
                )}
              </h3>
              <p>我会陪你沿着时间与地理，发现故事里的更多细节。你也可以让我在地图上添一笔。</p>
              <div className="mode-note">
                <span className="online-dot" />
                {settings?.connection === 'codex'
                  ? `本地 Codex · ${settings.agentModel || '默认模型'}`
                  : settings?.mode === 'live'
                    ? `已连接 · ${settings.model}`
                    : '演示模式 · 连接模型后可自由探索'}
              </div>
            </div>
            {!detail?.messages.length && (
              <div className="starter-content">
                <div className="assistant-message-avatar">
                  <Sparkles size={13} />
                  <span>山河</span>
                </div>
                <p>
                  {!story?.events.length
                    ? '故事正等待第一笔。你可以手动添加事件，或连接模型，让它帮你展开这个故事。'
                    : story.events.some((e) => e.id === 'su-1037')
                      ? '我们已经把苏轼的主要人生节点放在地图上。从眉山到儋州，仕途起伏与诗意人生，都藏在这条旅途中。'
                      : story?.kind === 'history'
                        ? '事件已经铺在时间与地图上。你可以从一次王朝更替出发，观察它与山川、城池的关系。'
                        : story?.events.length
                          ? '旅程已在地图上展开。点击一个节点，看看下一站的故事。'
                          : '故事正等待第一笔。你可以手动添加事件，或连接模型，让它帮你展开这个故事。'}
                </p>
                <div className="suggestion-label">不妨从这里开始</div>
                <div className="suggestions">
                  {[
                    story?.kind === 'biography' ? '聊聊苏轼在黄州的岁月' : '显示旅途路线',
                    '在地图上标记主要山川',
                    '开启三维地形',
                  ].map((text, i) => (
                    <Button
                      key={text}
                      onClick={() => void sendChat(text)}
                      disabled={!story || disableEdit}
                    >
                      {i === 0 ? (
                        <Feather size={15} />
                      ) : i === 1 ? (
                        <Mountain size={15} />
                      ) : (
                        <Globe2 size={15} />
                      )}
                      <span>{text}</span>
                      <ArrowUpRight size={13} />
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {detail?.messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {chatBusy && (
              <>
                <div className="chat-message user">
                  <p>{pendingPrompt}</p>
                </div>
                {toolProgress.length > 0 && (
                  <div className="agent-tool-progress" aria-live="polite">
                    {toolProgress.map((text, i) => (
                      <div key={i}>
                        <Check size={13} />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {streamText && (
                  <ChatMessage
                    message={{
                      id: 'stream',
                      role: 'assistant',
                      content: streamText,
                      actions: [],
                      mode: 'live',
                      createdAt: '',
                    }}
                  />
                )}
                <div className="thinking" role="status">
                  <span />
                  <span />
                  <span />
                  {streamText ? '正在完成回答…' : agentStatus}
                </div>
              </>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="chat-bottom">
            <div className="chat-capabilities">
              <span>
                <MapPin size={12} />
                地点标记
              </span>
              <span>
                <Route size={12} />
                路线绘制
              </span>
              <span>
                <History size={12} />
                事件补充
              </span>
            </div>
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat();
              }}
            >
              <label className="sr-only" htmlFor="chat-input">
                与山河对话
              </label>
              <Textarea
                id="chat-input"
                placeholder="问一段往事，或去一个地方…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
                disabled={!story || chatBusy}
                rows={3}
                maxLength={8000}
              />
              <div className="composer-bottom">
                <Button type="button" onClick={() => setModal('settings')}>
                  <span className="model-dot" />
                  {settings?.connection === 'codex'
                    ? `Codex · ${settings.agentModel || '默认模型'}`
                    : settings?.mode === 'live'
                      ? settings.model
                      : '演示模式'}
                  <ChevronDown size={12} />
                </Button>
                {chatBusy ? (
                  <Button
                    className="send-button stop-button"
                    type="button"
                    aria-label="停止生成"
                    title="停止生成"
                    disabled={stopping}
                    onClick={async () => {
                      const controller = chatController.current;
                      setStopping(true);
                      try {
                        if (story) await api(`/stories/${story.id}/chat/cancel`, json('POST', {}));
                      } catch {
                        /* The interrupted stream reconciles against the saved story below. */
                      } finally {
                        controller?.abort();
                      }
                    }}
                  >
                    {stopping ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <Square size={15} fill="currentColor" />
                    )}
                  </Button>
                ) : (
                  <Button
                    className="send-button"
                    type="submit"
                    aria-label="发送消息"
                    disabled={!chatInput.trim() || !story || disableEdit}
                  >
                    <ArrowUp size={18} />
                  </Button>
                )}
              </div>
            </form>
            <p className="chat-disclaimer">
              {settings?.mode === 'live'
                ? '模型生成内容需核验 · 修改自动保存在本地'
                : '演示指令可直接体验 · 不是实时模型回答'}
            </p>
          </div>
        </aside>
      )}
      <Input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importStory(file);
          e.target.value = '';
        }}
      />
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          {story && <Button onClick={() => void openStory(story.id)}>刷新故事</Button>}
          <IconButton label="关闭错误提示" onClick={() => setError('')}>
            <X size={17} />
          </IconButton>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}

      {modal === 'new' && (
        <NewStoryDialog
          onClose={() => setModal(null)}
          onCreate={async (title, kind, template) => {
            const next = await api<Story>('/stories', json('POST', { title, kind, template }));
            setStories((list) => [...list, next]);
            setModal(null);
            await openStory(next.id);
            flash('新故事已创建');
          }}
        />
      )}
      {!browserMode && modal === 'settings' && (
        <SettingsDialog
          settings={settings}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            const next = await api<Settings>('/settings', json('PUT', data));
            setSettings(next);
            setModal(null);
            flash(
              next.mode === 'live' ? '模型配置已保存，可开始对话' : '已保存设置，当前使用演示模式',
            );
          }}
        />
      )}
      {browserMode && modal === 'desktop' && (
        <DesktopGuide
          onClose={() => setModal(null)}
          onExport={exportStory}
          canExport={!!story && !disableEdit}
        />
      )}
      {modal === 'snapshots' && (
        <Dialog
          title="故事的每一个版本"
          description="快照保存故事、地图视角与对话。恢复之前会自动备份当前版本。"
          onClose={() => setModal(null)}
        >
          <div className="snapshot-list">
            {detail?.snapshots.map((s) => (
              <div key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <small>{new Date(s.createdAt).toLocaleString('zh-CN')}</small>
                </div>
                <Button
                  className="subtle-button"
                  disabled={disableEdit}
                  onClick={() =>
                    void mutate(async () => {
                      if (!story) return;
                      const next = await api<StoryDetail>(
                        `/stories/${story.id}/snapshots/${s.id}/restore`,
                        json('POST', { revision: story.revision }),
                      );
                      updateDetail(next);
                      setSelectedId(next.story.events[0]?.id || '');
                      setModal(null);
                      flash('已恢复版本，并备份了恢复前的内容');
                    })
                  }
                >
                  恢复
                </Button>
              </div>
            ))}
            {!detail?.snapshots.length && (
              <div className="empty-snapshots">
                <History size={32} />
                <p>还没有保存的版本</p>
                <small>在探索的某个时刻，按下「保存快照」。</small>
              </div>
            )}
          </div>
          <Button
            className="primary-button full-width"
            disabled={!story || disableEdit}
            onClick={snapshot}
          >
            <BookmarkPlus size={16} />
            保存现在这一刻
          </Button>
        </Dialog>
      )}
      {modal === 'marker' && story && (
        <MarkerDialog
          point={point?.coordinates || selected?.coordinates || story.view.center}
          onClose={() => setModal(null)}
          onSave={async (marker) => {
            await apply([
              {
                type: 'add_marker',
                marker: { ...marker, id: crypto.randomUUID(), confidence: 'unverified' },
              },
            ]);
            setModal(null);
            setPoint(null);
            flash('地点标记已保存');
          }}
        />
      )}
      {modal === 'event' && story && (
        <EventDialog
          event={editingEvent}
          isTravel={story.kind === 'travel'}
          defaultPoint={point?.coordinates || selected?.coordinates || story.view.center}
          onClose={() => setModal(null)}
          onSave={async (event) => {
            if (editingEvent) {
              const next = await api<Story>(
                `/stories/${story.id}`,
                json('PUT', {
                  ...story,
                  events: story.events
                    .map((e) => (e.id === event.id ? event : e))
                    .sort((a, b) => a.year - b.year),
                }),
              );
              updateStory(next);
            } else await apply([{ type: 'add_event', event }]);
            setSelectedId(event.id);
            setModal(null);
            flash('事件已保存');
          }}
        />
      )}
      {modal === 'about' && (
        <Dialog title="山河 · Story Atlas" onClose={() => setModal(null)}>
          <div className="about-mark">
            <img src={assetUrl('icon.svg')} width="56" height="56" alt="山河" />
            <p>在地图上，读懂每一个故事。</p>
          </div>
          <div className="about-details">
            <p>
              <strong>{browserMode ? '属于你的浏览器故事库' : '属于你的本地故事库'}</strong>
              <br />
              {browserMode
                ? '事件、路线、标记、对话与快照保存在当前浏览器的 IndexedDB，不会上传到 GitHub。清除网站数据会删除故事，请通过导出 JSON 备份或迁移到本地版。'
                : '事件、路线、标记、对话与快照保存在本机 SQLite。导出的 JSON 可以在另一台设备重新导入。'}
            </p>
            <p>
              <strong>地图与资料</strong>
              <br />
              底图使用 Natural Earth 公共领域数据，在线地形由 Esri 与 Mapzen
              提供。地点是概略定位，路线是节点连线，当前版本没有复原历史疆界。
            </p>
            <p>
              <strong>像 App 一样使用</strong>
              <br />
              {browserMode
                ? '可在支持安装的浏览器中将在线版添加到桌面；这仍是在线版，AI 探索需另行安装山河桌面 App。地形瓦片需要网络。'
                : '运行生产版本后，可在支持安装的浏览器中将山河安装为应用。本地后端需要保持运行；地形瓦片及远程模型需要网络。'}
            </p>
            <p>
              <strong>连接你自己的模型</strong>
              <br />
              {browserMode
                ? 'AI 探索在桌面版中使用。可以导出当前故事，在桌面版导入后，通过本机 Codex 或模型 API 继续对话。'
                : '支持 Chat Completions 工具调用协议，也支持本地模型服务。只有发送对话时，当前故事和最近对话才会发送到你配置的服务。'}
            </p>
          </div>
          <span className="version-label">山河 0.1.0 · LOCAL FIRST</span>
        </Dialog>
      )}
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  return (
    <div className={'chat-message ' + message.role}>
      {message.role === 'assistant' && (
        <div className="assistant-message-avatar">
          <Sparkles size={13} />
          <span>山河</span>
          <small>{message.mode === 'demo' ? '演示回答' : '模型回答'}</small>
        </div>
      )}
      <p>{message.content}</p>
      {message.actions.length > 0 && (
        <div className="action-receipt">
          <Check size={13} />
          <span>已保存 {message.actions.length} 项地图操作</span>
          <MapPin size={12} />
        </div>
      )}
    </div>
  );
}

function NewStoryDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, kind: Story['kind'], template: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Story['kind']>('history');
  const [template, setTemplate] = useState('blank');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const choose = (id: string, name: string, type: Story['kind']) => {
    setTemplate(id);
    setTitle(name);
    setKind(type);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onCreate(title, kind, template);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="一个新的故事，始于好奇"
      description="跟随一个人，走进一个时代，或规划下一次远行。"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label className="field-label">
          故事名称
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：李白的漫游人生"
            required
            maxLength={80}
          />
        </label>
        <fieldset className="kind-fieldset">
          <legend>故事类型</legend>
          <RadioGroup
            className="kind-options"
            aria-label="故事类型"
            value={kind}
            onValueChange={(value) => {
              setKind(value as Story['kind']);
              setTemplate('blank');
            }}
          >
            {(Object.keys(kindLabels) as Story['kind'][]).map((k) => (
              <RadioItem key={k} value={k}>
                {kindLabels[k]}
              </RadioItem>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="template-title">
          从一份种子故事开始 <span>也可以直接创建空白故事</span>
        </div>
        <div className="template-options">
          {[
            ['sushi', '苏轼的一生', 'biography'],
            ['five', '五代十国', 'history'],
            ['travel', '江南三日漫游', 'travel'],
          ].map(([id, name, type]) => (
            <Button
              type="button"
              key={id}
              className={template === id ? 'active' : ''}
              onClick={() => choose(id, name, type as Story['kind'])}
            >
              <BookOpen size={16} />
              {name}
              {template === id && <Check size={14} />}
            </Button>
          ))}
        </div>
        {template !== 'blank' && (
          <Button
            type="button"
            className="text-button blank-option"
            onClick={() => setTemplate('blank')}
          >
            改为空白故事
          </Button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button className="primary-button full-width" disabled={busy || !title.trim()}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}创建故事
        </Button>
      </form>
    </Dialog>
  );
}
function SettingsDialog({
  settings,
  onClose,
  onSave,
}: {
  settings: Settings | null;
  onClose: () => void;
  onSave: (data: object) => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(settings?.baseUrl || 'https://api.openai.com/v1');
  const [model, setModel] = useState(settings?.model || '');
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'api' | 'codex'>(settings?.connection || 'api');
  const [agentPath, setAgentPath] = useState(settings?.agentPath || '');
  const [agentModel, setAgentModel] = useState(settings?.agentModel || '');
  const [agentReady, setAgentReady] = useState(false);
  return (
    <Dialog
      title="连接你的探索助手"
      description="选择探索助手，为故事添加事件、标记地点、绘制路线。可以使用本机 Codex，也可以连接模型 API。"
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave({
              baseUrl,
              model,
              apiKey: key || undefined,
              clearKey,
              connection,
              agentPath,
              agentModel,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <RadioGroup
          className="connection-picker"
          aria-label="连接方式"
          value={connection}
          onValueChange={(value) => setConnection(value as 'api' | 'codex')}
          disabled={busy}
        >
          <RadioItem value="codex">
            <Monitor size={18} aria-hidden="true" />
            <strong>本地 Agent</strong>
            <span>复用已登录的 Codex</span>
          </RadioItem>
          <RadioItem value="api">
            <Plug size={18} aria-hidden="true" />
            <strong>模型 API</strong>
            <span>云端服务或 Ollama</span>
          </RadioItem>
        </RadioGroup>
        {connection === 'codex' ? (
          <AgentConnection
            path={agentPath}
            model={agentModel}
            onPath={setAgentPath}
            onModel={setAgentModel}
            onReady={setAgentReady}
          />
        ) : (
          <>
            <label className="field-label">
              API 地址
              <Input
                type="url"
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label className="field-label">
              模型名称
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="填写服务商提供的模型 ID"
                maxLength={200}
              />
            </label>
            <label className="field-label">
              API Key
              <Input
                type="password"
                autoComplete="new-password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={settings?.hasKey ? '已设置，留空则保留' : '本地模型可留空'}
              />
            </label>
            <p className="field-hint">
              密钥仅保存在本机
              SQLite，不会返回浏览器，也不包含在故事导出中。模型名称留空可切回演示模式。
            </p>
            {settings?.hasKey && (
              <label className="check-label">
                <Checkbox
                  checked={clearKey}
                  onCheckedChange={(checked) => setClearKey(checked === true)}
                />
                清除已保存的密钥
              </label>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          className="primary-button full-width"
          disabled={busy || (connection === 'codex' && !agentReady)}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}保存配置
        </Button>
      </form>
    </Dialog>
  );
}
function MarkerDialog({
  point,
  onClose,
  onSave,
}: {
  point: [number, number];
  onClose: () => void;
  onSave: (marker: {
    label: string;
    coordinates: [number, number];
    kind: 'place' | 'mountain' | 'river' | 'note';
    description: string;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog title="给地图添一个标记" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await onSave({
              label: String(data.get('label')),
              coordinates: [Number(data.get('lng')), Number(data.get('lat'))],
              kind: data.get('kind') as 'place',
              description: String(data.get('description')),
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          地点名称
          <Input name="label" required autoFocus maxLength={100} placeholder="例如：东坡赤壁" />
        </label>
        <label className="field-label">
          标记类型
          <Select
            name="kind"
            label="标记类型"
            defaultValue="place"
            options={[
              { value: 'place', label: '地点' },
              { value: 'mountain', label: '山峰 / 山脉' },
              { value: 'river', label: '河流' },
              { value: 'note', label: '笔记' },
            ]}
          />
        </label>
        <div className="field-grid">
          <label className="field-label">
            经度
            <Input
              name="lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              defaultValue={point[0]}
              required
            />
          </label>
          <label className="field-label">
            纬度
            <Input
              name="lat"
              type="number"
              step="any"
              min={-85}
              max={85}
              defaultValue={point[1]}
              required
            />
          </label>
        </div>
        <label className="field-label">
          地点笔记
          <Textarea
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="记下这里与故事的联系…"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <Button className="primary-button full-width" disabled={busy}>
          <MapPin size={16} />
          保存标记
        </Button>
      </form>
    </Dialog>
  );
}
function EventDialog({
  event,
  isTravel,
  defaultPoint,
  onClose,
  onSave,
}: {
  event?: StoryEvent;
  isTravel: boolean;
  defaultPoint: [number, number];
  onClose: () => void;
  onSave: (event: StoryEvent) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog title={event ? '编辑这一刻' : '为故事添加一个时刻'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await onSave({
              ...event,
              id: event?.id || crypto.randomUUID(),
              year: Number(data.get('year')),
              title: String(data.get('title')),
              place: String(data.get('place')),
              coordinates: [Number(data.get('lng')), Number(data.get('lat'))],
              description: String(data.get('description')),
              category: data.get('category') as StoryEvent['category'],
              quote: String(data.get('quote')) || undefined,
              confidence: 'unverified',
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          事件名称
          <Input
            name="title"
            required
            autoFocus
            defaultValue={event?.title}
            maxLength={100}
            placeholder="例如：初到黄州"
          />
        </label>
        <div className="field-grid">
          <label className="field-label">
            {isTravel ? '第几天' : '公历年份（负数为公元前）'}
            <Input
              name="year"
              type="number"
              min={-10000}
              max={10000}
              required
              defaultValue={event?.year || (isTravel ? 1 : 1080)}
            />
          </label>
          <label className="field-label">
            事件类型
            <Select
              name="category"
              label="事件类型"
              defaultValue={event?.category || 'life'}
              options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
            />
          </label>
        </div>
        <label className="field-label">
          地点名称
          <Input
            name="place"
            required
            maxLength={100}
            defaultValue={event?.place}
            placeholder="例如：黄州"
          />
        </label>
        <div className="field-grid">
          <label className="field-label">
            经度
            <Input
              name="lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              required
              defaultValue={event?.coordinates[0] ?? defaultPoint[0]}
            />
          </label>
          <label className="field-label">
            纬度
            <Input
              name="lat"
              type="number"
              step="any"
              min={-85}
              max={85}
              required
              defaultValue={event?.coordinates[1] ?? defaultPoint[1]}
            />
          </label>
        </div>
        <label className="field-label">
          事件描述
          <Textarea
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={event?.description}
          />
        </label>
        <label className="field-label">
          一句诗 / 一句话
          <Input
            name="quote"
            maxLength={500}
            defaultValue={event?.quote}
            placeholder="为这一刻，留下一句话"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button className="primary-button full-width" disabled={busy}>
          <Check size={16} />
          保存事件
        </Button>
      </form>
    </Dialog>
  );
}
