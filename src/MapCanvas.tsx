import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import maplibregl, { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { Story, StoryEvent } from '../shared/schema';

export type MapHandle = {
  fit: () => void;
  zoom: (delta: number) => void;
  getView: () => Story['view'] | undefined;
};
type Props = {
  story: Story;
  selected: StoryEvent | undefined;
  onSelect: (id: string) => void;
  onPoint: (point: { coordinates: [number, number]; elevation: number | null }) => void;
};
const mountains: [string, [number, number]][] = [
  ['秦 岭', [107.8, 33.8]],
  ['大 巴 山', [108.3, 32.2]],
  ['武 夷 山', [117.5, 27.65]],
  ['太 行 山', [113.2, 37.1]],
  ['南 岭', [112.7, 24.9]],
  ['大 别 山', [115.5, 31.2]],
];
const riverLabels: [string, [number, number]][] = [
  ['长 江', [112.7, 29.8]],
  ['黄 河', [110.8, 36.6]],
  ['东 海', [124, 29.4]],
  ['南 海', [114.8, 20.7]],
];
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
function style(): StyleSpecification {
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: '/data/land.geojson' },
      relief: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 13,
        attribution: 'Relief © Esri, USGS',
      },
      rivers: {
        type: 'geojson',
        data: '/data/rivers.geojson',
        attribution:
          '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>',
      },
      routes: { type: 'geojson', data: empty },
      progress: { type: 'geojson', data: empty },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': '#dce5df' } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#edeadc' } },
      {
        id: 'relief',
        type: 'raster',
        source: 'relief',
        paint: { 'raster-opacity': 0.48, 'raster-saturation': -0.7, 'raster-contrast': -0.15 },
      },
      {
        id: 'coast',
        type: 'line',
        source: 'land',
        paint: { 'line-color': '#b1bdb1', 'line-width': 0.6, 'line-opacity': 0.5 },
      },
      {
        id: 'rivers',
        type: 'line',
        source: 'rivers',
        paint: {
          'line-color': '#80a9ad',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 2.1],
          'line-opacity': 0.75,
        },
      },
      {
        id: 'route-shadow',
        type: 'line',
        source: 'routes',
        paint: { 'line-color': '#faf6ed', 'line-width': 5, 'line-opacity': 0.7 },
      },
      {
        id: 'routes',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-dasharray': [2.5, 2.5],
          'line-opacity': 0.72,
        },
      },
      {
        id: 'progress',
        type: 'line',
        source: 'progress',
        paint: { 'line-color': '#9d664a', 'line-width': 2.6, 'line-opacity': 0.92 },
      },
    ],
  };
}

const MapCanvas = forwardRef<MapHandle, Props>(function MapCanvas(
  { story, selected, onSelect, onPoint },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const callbacks = useRef({ onSelect, onPoint });
  callbacks.current = { onSelect, onPoint };
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fatal, setFatal] = useState(false);
  const lastNavigation = useRef<{ view: string; selectedId?: string } | null>(null);
  const currentStory = useRef(story);
  currentStory.current = story;
  const motion = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900);
  const fit = () => {
    const m = map.current;
    if (!m) return;
    const events = currentStory.current.events;
    if (events.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      events.forEach((e) => bounds.extend(e.coordinates));
      m.fitBounds(bounds, {
        padding: { top: 90, bottom: 80, left: 95, right: 95 },
        maxZoom: 8,
        duration: motion(),
      });
    } else m.flyTo({ ...currentStory.current.view, duration: motion() });
  };
  useImperativeHandle(ref, () => ({
    fit,
    zoom: (delta) =>
      map.current?.easeTo({ zoom: (map.current?.getZoom() || 4) + delta, duration: 300 }),
    getView: () => {
      const m = map.current;
      return m
        ? { center: [m.getCenter().lng, m.getCenter().lat], zoom: m.getZoom(), pitch: m.getPitch() }
        : undefined;
    },
  }));
  useEffect(() => {
    if (!container.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: style(),
        ...story.view,
        minZoom: 2,
        maxZoom: 14,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
        dragRotate: true,
        maxPitch: 65,
      });
    } catch {
      setFatal(true);
      return;
    }
    map.current = m;
    m.on('style.load', () => setReady(true));
    m.on('error', (event) => {
      const sourceId = (event as unknown as { sourceId?: string }).sourceId;
      if (
        event.error?.message?.includes('Failed to fetch') ||
        sourceId === 'relief' ||
        sourceId === 'dem'
      )
        setOffline(true);
    });
    m.on('sourcedata', (event) => {
      if (event.sourceId === 'relief' && event.isSourceLoaded) setOffline(false);
    });
    m.on('click', (event) => {
      let elevation: number | null = null;
      try {
        const result = m.queryTerrainElevation(event.lngLat);
        elevation = typeof result === 'number' ? Math.round(result) : null;
      } catch {
        /* terrain disabled */
      }
      callbacks.current.onPoint({
        coordinates: [Number(event.lngLat.lng.toFixed(5)), Number(event.lngLat.lat.toFixed(5))],
        elevation,
      });
    });
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      markers.current.forEach((v) => v.remove());
      markers.current = [];
      m.remove();
      map.current = null;
      setReady(false);
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const key = JSON.stringify(story.view);
    const previous = lastNavigation.current;
    if (!previous || previous.view !== key)
      map.current.flyTo({ ...story.view, duration: motion() });
    else if (selected && previous.selectedId !== selected.id)
      map.current.easeTo({ center: selected.coordinates, offset: [50, -10], duration: motion() });
    lastNavigation.current = { view: key, selectedId: selected?.id };
  }, [
    ready,
    story.view.center[0],
    story.view.center[1],
    story.view.zoom,
    story.view.pitch,
    selected?.id,
  ]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('routes') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: story.routes.map((r) => ({
        type: 'Feature',
        properties: { color: r.color },
        geometry: { type: 'LineString', coordinates: r.coordinates },
      })),
    });
    const past = story.events.filter((e) => selected && e.year <= selected.year);
    (m.getSource('progress') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features:
        story.routes.some((r) => r.id === 'su-route' || r.id === 'trip-route') && past.length > 1
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: past.map((e) => e.coordinates) },
              },
            ]
          : [],
    });
    for (const id of ['routes', 'route-shadow', 'progress'])
      m.setLayoutProperty(id, 'visibility', story.layers.routes ? 'visible' : 'none');
    m.setLayoutProperty('rivers', 'visibility', story.layers.rivers ? 'visible' : 'none');
    if (story.layers.terrain) {
      if (!m.getSource('dem'))
        m.addSource('dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          encoding: 'terrarium',
          maxzoom: 14,
          attribution: 'Elevation: Mapzen / AWS Open Data',
        });
      m.setTerrain({ source: 'dem', exaggeration: 1.3 });
    } else m.setTerrain(null);
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const add = (
      el: HTMLElement,
      coordinates: [number, number],
      anchor: maplibregl.PositionAnchor = 'center',
    ) => {
      markers.current.push(
        new maplibregl.Marker({ element: el, anchor }).setLngLat(coordinates).addTo(m),
      );
      if (el.tagName !== 'BUTTON') {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.setAttribute('aria-hidden', 'true');
      }
    };
    const groups = new Map<string, StoryEvent[]>();
    story.events.forEach((e) => {
      const key = e.coordinates.join(',');
      groups.set(key, [...(groups.get(key) || []), e]);
    });
    groups.forEach((events) => {
      const event = events.find((e) => e.id === selected?.id) || events[0];
      const index = story.events.findIndex((e) => e.id === event.id);
      const el = document.createElement('button');
      el.className = 'event-pin' + (event.id === selected?.id ? ' selected' : '');
      el.setAttribute('aria-label', `${event.year} ${event.title}，${event.place}`);
      el.title = events.map((e) => `${e.year} ${e.title}`).join(' / ');
      const dot = document.createElement('span');
      dot.className = 'pin-dot';
      dot.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('span');
      label.className = 'pin-label';
      label.textContent = event.place;
      el.append(dot, label);
      el.onclick = (e) => {
        e.stopPropagation();
        callbacks.current.onSelect(event.id);
      };
      add(el, event.coordinates, 'left');
    });
    if (story.layers.mountains)
      mountains
        .filter(([label]) => !story.markers.some((p) => p.label === label.replaceAll(' ', '')))
        .forEach(([label, coordinates]) => {
          const el = document.createElement('span');
          el.className = 'geo-label mountain-label';
          el.textContent = '△ ' + label;
          add(el, coordinates);
        });
    if (story.layers.rivers)
      riverLabels
        .filter(([label]) => !story.markers.some((p) => p.label === label.replaceAll(' ', '')))
        .forEach(([label, coordinates]) => {
          const el = document.createElement('span');
          el.className = 'geo-label river-label';
          el.textContent = label;
          add(el, coordinates);
        });
    story.markers.forEach((marker) => {
      if (
        (marker.kind === 'mountain' && !story.layers.mountains) ||
        (marker.kind === 'river' && !story.layers.rivers)
      )
        return;
      const el = document.createElement('button');
      el.className = 'annotation-pin ' + marker.kind;
      el.textContent =
        (marker.kind === 'mountain' ? '△ ' : marker.kind === 'river' ? '≈ ' : '+ ') + marker.label;
      el.title = marker.description;
      el.setAttribute('aria-label', marker.label + '，查看地点笔记');
      el.onclick = (e) => {
        e.stopPropagation();
        const content = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = marker.label;
        const body = document.createElement('p');
        body.textContent = marker.description;
        content.append(title, body);
        new maplibregl.Popup({ maxWidth: '240px', offset: 18 })
          .setLngLat(marker.coordinates)
          .setDOMContent(content)
          .addTo(m);
      };
      add(el, marker.coordinates, 'bottom');
    });
  }, [ready, story.events, story.markers, story.routes, story.layers, selected]);
  return (
    <>
      <div className="map-canvas" ref={container} aria-label="交互式故事地图" />
      {offline && <div className="map-network">在线地形暂不可用 · 本地地理底图仍可浏览</div>}
      {fatal && (
        <div className="map-fallback">
          <strong>当前浏览器未启用 WebGL</strong>
          <p>请在浏览器中开启图形加速。故事、时间线和对话仍然可用。</p>
        </div>
      )}
    </>
  );
});
export default MapCanvas;
