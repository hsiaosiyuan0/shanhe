import type { Map, MapSourceDataEvent, ErrorEvent, VectorTileSource } from 'maplibre-gl';
import {
  adminDetailMinZoom,
  modernAdminLayers,
  modernAdminSource,
  modernAdminSourceId,
  boundaryOverviewSourceId,
} from './modernAdmin';
import { AdminBoundaryOverview, type BoundaryStatus } from './AdminBoundaryOverview';

export type AdminDetailStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Load viewport tiles only after modern comparison is enabled and zoomed in. */
export class ModernAdminController {
  private enabled = false;
  private failed = false;
  private status: AdminDetailStatus = 'idle';
  private layerIds = modernAdminLayers().map((layer) => layer.id);
  private overview: AdminBoundaryOverview;
  constructor(
    private map: Map,
    private onStatus: (status: AdminDetailStatus) => void,
    onBoundaryStatus: (state: BoundaryStatus) => void = () => {},
  ) {
    this.overview = new AdminBoundaryOverview(map, onBoundaryStatus);
    map.on('zoomend', this.update);
    map.on('sourcedata', this.onData);
    map.on('error', this.onError);
  }
  private report(status: AdminDetailStatus) {
    if (status !== this.status) {
      this.status = status;
      this.onStatus(status);
    }
  }
  private onData = (event: MapSourceDataEvent) => {
    // Tile completions have no sourceDataType. `content` only announces TileJSON;
    // `idle` covers a viewport with no tiles to fetch (e.g. a hidden source).
    if (
      event.sourceId === modernAdminSourceId &&
      event.isSourceLoaded &&
      (event.sourceDataType === 'idle' || 'tile' in event) &&
      !this.failed
    )
      this.report('ready');
  };
  private onError = (event: ErrorEvent) => {
    if ((event as ErrorEvent & { sourceId?: string }).sourceId === modernAdminSourceId) {
      this.failed = true;
      this.report('error');
    }
  };
  private update = () => {
    const visible = this.enabled && this.map.getZoom() >= adminDetailMinZoom;
    if (visible && !this.map.getSource(modernAdminSourceId)) {
      this.report('loading');
      this.map.addSource(modernAdminSourceId, modernAdminSource);
      this.map.addSource(boundaryOverviewSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Boundaries and place names stay under rivers, journeys and interactive notes.
      for (const layer of modernAdminLayers()) this.map.addLayer(layer, 'major-river-hover');
    }
    for (const id of this.layerIds)
      if (this.map.getLayer(id))
        this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    this.overview.setEnabled(visible);
  };
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.update();
  }
  retry() {
    this.overview.retry();
    const source = this.map.getSource(modernAdminSourceId) as VectorTileSource | undefined;
    if (!source) return;
    this.failed = false;
    this.report('loading');
    source.setUrl(modernAdminSource.url!);
  }
  dispose() {
    this.overview.dispose();
    this.map.off('zoomend', this.update);
    this.map.off('sourcedata', this.onData);
    this.map.off('error', this.onError);
  }
}
