import { AttributionControl, type Map } from 'maplibre-gl';

/** Keep MapLibre's source attribution and toggle, but start with the details closed. */
export class CollapsedAttributionControl extends AttributionControl {
  override onAdd(map: Map): HTMLElement {
    const element = super.onAdd(map);
    // Set compact immediately so later source loading does not expand it again.
    element.classList.add('maplibregl-compact');
    element.classList.remove('maplibregl-compact-show');
    element.removeAttribute('open');
    return element;
  }
}
