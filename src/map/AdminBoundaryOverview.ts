import type { GeoJSONSource, Map } from 'maplibre-gl';
import { AdminBoundaryTileLoader, boundaryTilesForBounds } from './adminBoundaryTiles';
import { boundaryOverviewSourceId, cityBoundaryMinZoom } from './modernAdmin';

export type BoundaryStatus = { status: 'idle' | 'loading' | 'ready' | 'error'; message?: string };

export class AdminBoundaryOverview {
  private enabled = false;
  private controller?: AbortController;
  private key = '';
  constructor(
    private map: Map,
    private onStatus: (state: BoundaryStatus) => void,
    private loader: Pick<AdminBoundaryTileLoader, 'load'> = new AdminBoundaryTileLoader(),
  ) {
    map.on('moveend', this.update);
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.update();
  }
  private update = () => {
    const zoom = this.map.getZoom();
    if (!this.enabled || zoom < cityBoundaryMinZoom || zoom >= 9) {
      this.controller?.abort();
      this.controller = undefined;
      this.key = '';
      this.onStatus({ status: 'idle' });
      return;
    }
    const bounds = this.map.getBounds();
    let tiles;
    try {
      tiles = boundaryTilesForBounds([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    } catch (error) {
      this.controller?.abort();
      this.key = '';
      this.onStatus({ status: 'error', message: (error as Error).message });
      return;
    }
    const key = JSON.stringify(tiles);
    if (key === this.key) return;
    this.key = key;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.onStatus({ status: 'loading' });
    this.loader
      .load(tiles, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        (this.map.getSource(boundaryOverviewSourceId) as GeoJSONSource | undefined)?.setData(data);
        this.onStatus({ status: 'ready' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        controller.abort(); // Stop remaining requests after a partial failure.
        this.key = '';
        this.onStatus({
          status: 'error',
          message:
            error instanceof Error && !(error instanceof TypeError)
              ? error.message
              : '部分市县边界加载失败，请检查网络后重试',
        });
      });
  };
  retry() {
    this.key = '';
    this.update();
  }
  dispose() {
    this.controller?.abort();
    this.map.off('moveend', this.update);
  }
}
