import type { MapMarker } from '../../shared/schema';

const symbols: Record<MapMarker['kind'], { viewBox: string; paths: string[] }> = {
  mountain: {
    viewBox: '0 0 32 24',
    paths: [
      'M12 18.5 18.7 7.6q.8-1.2 1.6 0L28 19.5c-5 .7-10 .5-16-1Z',
      'M2 19c3.8-3.2 5.9-9.2 9.2-14.1.4-.6 1.2-.6 1.6.1 2.5 5 4.6 10.4 9.5 14-6 1.7-14.5 1.8-20.3 0Z',
      'M12 6c.8 4.7 2.5 8.3 6.4 12.4-2.8-1-5.3-2.8-7.4-5.3Z',
    ],
  },
  river: {
    viewBox: '0 0 56 12',
    paths: ['M2 5C12-1 17 11 28 5S44-1 54 5', 'M8 10c9-5 14 4 24 0s13-3 17-1'],
  },
  place: {
    viewBox: '0 0 24 24',
    paths: [
      'M12 20s6-5.8 6-11a6 6 0 0 0-12 0c0 5.2 6 11 6 11Z',
      'M10 9a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    ],
  },
  note: {
    viewBox: '0 0 24 24',
    paths: ['m5 17-1 4 4-1L20 8l-3-3Z', 'm14 8 3 3'],
  },
};

/** Map lettering with a decorative symbol; the whole label remains a button. */
export function annotationElement(marker: MapMarker): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'annotation-pin ' + marker.kind;
  const ink = document.createElement('span');
  ink.className = 'annotation-ink';
  const symbol = symbols[marker.kind];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('annotation-symbol');
  svg.setAttribute('viewBox', symbol.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of symbol.paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  const label = document.createElement('span');
  label.className = 'annotation-label';
  label.textContent = marker.label;
  ink.append(svg, label);
  button.append(ink);
  return button;
}
