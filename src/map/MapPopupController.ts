import { Popup, type Map } from 'maplibre-gl';

export type PopupDetails = {
  text: string;
  links: { label: string; url: string }[];
};

/** One map, one open place note. Marker clicks never rely on map-click bubbling. */
export class MapPopupController {
  private active: { key: string; popup: Popup; trigger: HTMLButtonElement | null } | null = null;

  constructor(private readonly map: Map) {}

  close(restoreFocus = false): boolean {
    const active = this.active;
    if (!active) return false;
    this.active = null;
    active.trigger?.setAttribute('aria-expanded', 'false');
    active.popup.remove();
    const target = active.trigger ?? this.map.getCanvas();
    if (restoreFocus && target.isConnected) target.focus({ preventScroll: true });
    return true;
  }

  toggle(
    key: string,
    trigger: HTMLButtonElement | null,
    coordinates: [number, number],
    heading: string,
    description: string,
    anchor: 'center' | 'bottom' = 'bottom',
    details?: PopupDetails,
  ) {
    const same = this.active?.key === key;
    this.close();
    if (same) return;

    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = heading;
    const body = document.createElement('div');
    body.className = 'map-popup-body';
    const descriptionText = document.createElement('p');
    descriptionText.textContent = description;
    body.append(descriptionText);
    if (details) {
      const disclosure = document.createElement('details');
      disclosure.className = 'map-popup-sources';
      const summary = document.createElement('summary');
      summary.textContent = '名称与轮廓来源';
      const text = document.createElement('p');
      text.textContent = details.text;
      disclosure.append(summary, text);
      for (const link of details.links) {
        // Source data is untrusted. Only explicit web links can become anchors.
        if (!/^https?:\/\//i.test(link.url)) continue;
        const anchor = document.createElement('a');
        anchor.textContent = link.label;
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        disclosure.append(anchor);
      }
      body.append(disclosure);
    }
    content.append(title, body);

    // Leave room on either side of the map point for the automatic popup anchor.
    // Long river descriptions and saved notes remain readable on short maps.
    const sizeBody = () => {
      body.style.maxHeight = `${Math.max(48, this.map.getContainer().clientHeight / 2 - 110)}px`;
    };
    body.style.overflowY = 'auto';
    body.tabIndex = 0;
    body.setAttribute('aria-label', '地点说明');
    sizeBody();

    const popup = new Popup({
      maxWidth: '260px',
      offset: Math.max(18, (trigger?.offsetHeight ?? 0) / (anchor === 'center' ? 2 : 1) + 8),
      closeOnClick: false,
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
    })
      .setLngLat(coordinates)
      .setDOMContent(content);
    this.active = { key, popup, trigger };
    trigger?.setAttribute('aria-expanded', 'true');
    popup.on('close', () => {
      this.map.off('resize', sizeBody);
      // The close button can remove the popup without going through close().
      if (this.active?.popup !== popup) return;
      this.active = null;
      trigger?.setAttribute('aria-expanded', 'false');
      const target = trigger ?? this.map.getCanvas();
      if (target.isConnected) target.focus({ preventScroll: true });
    });
    this.map.on('resize', sizeBody);
    popup.addTo(this.map);
    const element = popup.getElement();
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', `${heading} · 地点信息`);
    // Reading or closing a note must not also select the map underneath it.
    for (const type of ['click', 'dblclick', 'mousedown', 'touchstart'])
      element.addEventListener(type, (event) => event.stopPropagation());
  }
}
