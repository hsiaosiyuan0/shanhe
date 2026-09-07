import { Popup, type Map } from 'maplibre-gl';

/** One map, one open place note. Marker clicks never rely on map-click bubbling. */
export class MapPopupController {
  private active: { key: string; popup: Popup; trigger: HTMLButtonElement } | null = null;

  constructor(private readonly map: Map) {}

  close(restoreFocus = false): boolean {
    const active = this.active;
    if (!active) return false;
    this.active = null;
    active.trigger.setAttribute('aria-expanded', 'false');
    active.popup.remove();
    if (restoreFocus && active.trigger.isConnected) active.trigger.focus({ preventScroll: true });
    return true;
  }

  toggle(
    key: string,
    trigger: HTMLButtonElement,
    coordinates: [number, number],
    heading: string,
    description: string,
    anchor: 'center' | 'bottom' = 'bottom',
  ) {
    const same = this.active?.key === key;
    this.close();
    if (same) return;

    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = heading;
    const body = document.createElement('p');
    body.textContent = description;
    content.append(title, body);

    const popup = new Popup({
      maxWidth: '260px',
      offset: Math.max(18, trigger.offsetHeight / (anchor === 'center' ? 2 : 1) + 8),
      closeOnClick: false,
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
    })
      .setLngLat(coordinates)
      .setDOMContent(content);
    this.active = { key, popup, trigger };
    trigger.setAttribute('aria-expanded', 'true');
    popup.on('close', () => {
      // The close button can remove the popup without going through close().
      if (this.active?.popup !== popup) return;
      this.active = null;
      trigger.setAttribute('aria-expanded', 'false');
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    });
    popup.addTo(this.map);
    const element = popup.getElement();
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', `${heading} · 地点信息`);
    // Reading or closing a note must not also select the map underneath it.
    for (const type of ['click', 'dblclick', 'mousedown', 'touchstart'])
      element.addEventListener(type, (event) => event.stopPropagation());
  }
}
