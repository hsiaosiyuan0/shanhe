import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl';
import {
  AdminPackageLoader,
  areaContains,
  type AdminArea,
  type AdminLevel,
  type AdminPackage,
} from './adminPackage';
import {
  resolveAdminLevel,
  type AdminLevelMode,
  adminSourceIds,
  modernAdminLayers,
  townLayer,
  townSource,
  townSourceId,
} from './modernAdmin';

export type AdminState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  level: AdminLevel;
  area?: AdminArea;
  message?: string;
};
const empty = { type: 'FeatureCollection' as const, features: [] };
type Point = [number, number];

/** A single active tier, with mesh boundaries and hover from one local dataset. */
export class ModernAdminController {
  private enabled = false;
  private levelMode: AdminLevelMode = 'auto';
  private disposed = false;
  private data?: AdminPackage;
  private request?: AbortController;
  private pointer?: Point;
  private state: AdminState = { status: 'idle', level: 4 };
  private layers = modernAdminLayers();
  constructor(
    private map: Map,
    private onState: (state: AdminState) => void,
    private loader: Pick<AdminPackageLoader, 'load'>,
  ) {
    map.on('zoom', this.update);
    map.on('movestart', this.clearHover);
    map.on('mousemove', this.onMouseMove);
    map.on('mouseout', this.clearHover);
  }
  private report(state: AdminState) {
    this.state = state;
    this.onState(state);
  }
  private initialize() {
    if (this.map.getSource('admin-areas')) return;
    for (const id of adminSourceIds)
      this.map.addSource(id, {
        type: 'geojson',
        data: empty,
        tolerance: 0,
        maxzoom: 18,
        ...(id === 'admin-areas' && {
          attribution:
            '<a href="https://cloudcenter.tianditu.gov.cn/administrativeDivision/" target="_blank" rel="noopener">行政区：天地图 · 2025.09 · 仅供地图可视化使用</a>',
        }),
      });
    for (const layer of this.layers) this.map.addLayer(layer, 'major-river-hover');
  }
  private visibility(visible: boolean) {
    for (const layer of this.layers)
      if (this.map.getLayer(layer.id))
        this.map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
  }
  private update = () => {
    if (this.disposed) return;
    const level = resolveAdminLevel(this.levelMode, this.map.getZoom());
    const showTowns = this.enabled && level === 6 && this.map.getZoom() >= 11;
    if (showTowns && !this.map.getSource(townSourceId)) {
      this.map.addSource(townSourceId, townSource);
      this.map.addLayer(townLayer, 'major-river-hover');
    }
    if (this.map.getLayer(townLayer.id))
      this.map.setLayoutProperty(townLayer.id, 'visibility', showTowns ? 'visible' : 'none');
    if (!this.enabled) return;
    if (this.state.level === level && this.state.status !== 'idle') return;
    this.load(level);
  };
  private async load(level: AdminLevel) {
    this.request?.abort();
    this.clearHover();
    this.data = undefined;
    this.initialize();
    this.visibility(false); // Do not leave an old tier visible while the new one loads.
    const request = new AbortController();
    this.request = request;
    this.report({ status: 'loading', level });
    const timeout = setTimeout(() => request.abort(new Error('行政区数据包加载超时')), 30_000);
    try {
      const data = await this.loader.load(level, request.signal);
      if (this.disposed || this.request !== request) return;
      request.signal.throwIfAborted();
      const payloads = [data.areas, data.borders, data.references, data.labels];
      this.map.removeFeatureState({ source: 'admin-areas' });
      await Promise.all(
        adminSourceIds.map((id, i) =>
          (this.map.getSource(id) as GeoJSONSource).setData(payloads[i], true),
        ),
      );
      if (this.disposed || this.request !== request) return;
      request.signal.throwIfAborted();
      this.data = data;
      this.visibility(true);
      this.report({ status: 'ready', level });
      if (this.pointer) this.hover(this.pointer);
    } catch (error) {
      if (this.disposed || this.request !== request) return;
      this.report({
        status: 'error',
        level,
        message:
          request.signal.aborted && request.signal.reason instanceof Error
            ? request.signal.reason.message
            : error instanceof Error
              ? error.message
              : '行政区数据包加载失败',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  private onMouseMove = (event: MapMouseEvent) => {
    // Never gate this on isStyleLoaded(): remote terrain may still be downloading.
    this.hover(this.map.isMoving() ? null : [event.lngLat.lng, event.lngLat.lat]);
  };
  private clearHover = () => this.hover(null);
  at(point: Point) {
    return this.enabled && this.data
      ? this.data.areas.features.find((area) => areaContains(area, point))
      : undefined;
  }
  hover(point: Point | null) {
    this.pointer = point || undefined;
    const area = point ? this.at(point) : undefined;
    if (area?.id === this.state.area?.id) return area;
    if (this.state.area)
      this.map.setFeatureState({ source: 'admin-areas', id: this.state.area.id }, { hover: false });
    if (area) this.map.setFeatureState({ source: 'admin-areas', id: area.id }, { hover: true });
    this.report({ ...this.state, area });
    return area;
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.request?.abort();
      this.request = undefined;
      this.clearHover();
      this.visibility(false);
      this.data = undefined;
      this.report({ status: 'idle', level: resolveAdminLevel(this.levelMode, this.map.getZoom()) });
    }
    this.update();
  }
  setLevelMode(mode: AdminLevelMode) {
    this.levelMode = mode;
    this.update();
  }
  retry() {
    if (this.enabled) this.load(resolveAdminLevel(this.levelMode, this.map.getZoom()));
  }
  dispose() {
    this.disposed = true;
    this.request?.abort();
    this.map.off('zoom', this.update);
    this.map.off('movestart', this.clearHover);
    this.map.off('mousemove', this.onMouseMove);
    this.map.off('mouseout', this.clearHover);
  }
}
