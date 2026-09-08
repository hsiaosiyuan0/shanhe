import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl';
import { AdminAreaLoader, type AdminArea } from './adminAreas';
import { cityBoundaryMinZoom, countyBoundaryMinZoom } from './modernAdmin';

export type AdminHoverState = {
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  area?: AdminArea;
};
export const adminHoverSourceId = 'modern-admin-hover';
const empty = { type: 'FeatureCollection' as const, features: [] };
type Point = [number, number];

/** One request at a time, only after the pointer settles. Geometry is cached
 * by area, so moving anywhere inside a loaded city/county stays synchronous. */
export class AdminAreaController {
  private enabled = false;
  private pointer?: Point;
  private center?: Point;
  private level?: 5 | 6;
  private request?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private cooldown = 0;
  private missing = new Set<string>();
  private stateKey = '';
  private paintedId?: number;
  private disposed = false;
  constructor(
    private map: Map,
    private onState: (state: AdminHoverState) => void,
    private loader: Pick<AdminAreaLoader, 'find' | 'load'> = new AdminAreaLoader(),
    private delay = 350,
  ) {
    map.on('movestart', this.onMoveStart);
    map.on('moveend', this.update);
    // Area hit testing uses cached polygons, independently of raster/tile readiness.
    // isStyleLoaded() can stay false while any unrelated source is downloading.
    map.on('mousemove', this.onMouseMove);
    map.on('mouseout', this.onMouseOut);
  }
  private onMouseMove = (event: MapMouseEvent) => {
    this.hover(this.map.isMoving() ? null : [event.lngLat.lng, event.lngLat.lat]);
  };
  private onMouseOut = () => this.hover(null);
  private onMoveStart = () => {
    this.hover(null);
  };
  private update = () => {
    if (this.disposed) return;
    const zoom = this.map.getZoom();
    const level =
      !this.enabled || zoom < cityBoundaryMinZoom
        ? undefined
        : zoom < countyBoundaryMinZoom
          ? 5
          : 6;
    if (level !== this.level) this.pointer = undefined;
    this.level = level;
    if (!level) {
      this.request?.abort();
      this.request = undefined;
      clearTimeout(this.timer);
      this.timer = undefined;
      this.center = undefined;
      this.report({ status: 'idle' });
      return;
    }
    if (!this.map.getSource(adminHoverSourceId)) {
      this.map.addSource(adminHoverSourceId, {
        type: 'geojson',
        data: empty,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Area outlines © OpenStreetMap contributors</a>',
      });
      const before = this.map.getLayer('modern-city-label')
        ? 'modern-city-label'
        : 'major-river-hover';
      this.map.addLayer(
        {
          id: 'admin-hover-fill',
          type: 'fill',
          source: adminHoverSourceId,
          paint: { 'fill-color': '#795478', 'fill-opacity': 0.13 },
        },
        before,
      );
      this.map.addLayer(
        {
          id: 'admin-hover-casing',
          type: 'line',
          source: adminHoverSourceId,
          layout: { 'line-join': 'round' },
          paint: { 'line-color': '#fffcf3', 'line-width': 6, 'line-opacity': 0.95 },
        },
        before,
      );
      this.map.addLayer(
        {
          id: 'admin-hover-outline',
          type: 'line',
          source: adminHoverSourceId,
          layout: { 'line-join': 'round' },
          paint: { 'line-color': '#68456b', 'line-width': 3.5 },
        },
        before,
      );
    }
    const center = this.map.getCenter();
    this.center = [center.lng, center.lat];
    this.refresh();
  };
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.update();
  }
  at(point: Point) {
    return this.level ? this.loader.find(point, this.level) : undefined;
  }
  hover(point: Point | null): AdminArea | undefined {
    this.pointer = point || undefined;
    this.refresh();
    return point ? this.at(point) : undefined;
  }
  private report(state: AdminHoverState) {
    const id = state.area?.id;
    if (id !== this.paintedId) {
      (this.map.getSource(adminHoverSourceId) as GeoJSONSource | undefined)?.setData(
        state.area ? { type: 'FeatureCollection', features: [state.area] } : empty,
      );
      this.paintedId = id;
    }
    const key = `${state.status}:${id ?? ''}`;
    if (key !== this.stateKey) {
      this.stateKey = key;
      this.onState(state);
    }
  }
  private pointKey(point: Point) {
    return `${this.level}:${point.map((p) => p.toFixed(3)).join(',')}`;
  }
  private refresh() {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.level) {
      this.report({ status: 'idle' });
      return;
    }
    const target = this.pointer || this.center;
    const area = this.pointer && this.at(this.pointer);
    if (area) {
      this.report({ status: 'ready', area });
      return;
    }
    if (!target) {
      this.report({ status: 'idle' });
      return;
    }
    const missing = this.missing.has(this.pointKey(target));
    const failed = this.cooldown > Date.now();
    this.report({
      status: failed ? 'error' : this.pointer ? (missing ? 'missing' : 'loading') : 'idle',
    });
    if (this.request || missing || failed || this.at(target)) return;
    this.timer = setTimeout(() => this.load(target), this.delay);
  }
  private async load(point: Point) {
    if (this.disposed || !this.level) return;
    const request = new AbortController();
    this.request = request;
    const level = this.level;
    const pointKey = this.pointKey(point);
    const timeout = setTimeout(() => request.abort(), 25_000);
    let failed = false;
    try {
      await this.loader.load(point, request.signal);
      if (!this.loader.find(point, level)) {
        this.missing.add(pointKey);
        if (this.missing.size > 64) this.missing.delete(this.missing.values().next().value!);
      }
    } catch {
      failed = true;
    } finally {
      clearTimeout(timeout);
      if (this.request === request) {
        this.request = undefined;
        if (failed) this.cooldown = Date.now() + 15_000;
        this.refresh();
      }
    }
  }
  retry() {
    this.cooldown = 0;
    this.missing.clear();
    this.refresh();
  }
  dispose() {
    this.disposed = true;
    this.request?.abort();
    this.request = undefined;
    clearTimeout(this.timer);
    this.map.off('movestart', this.onMoveStart);
    this.map.off('moveend', this.update);
    this.map.off('mousemove', this.onMouseMove);
    this.map.off('mouseout', this.onMouseOut);
  }
}
