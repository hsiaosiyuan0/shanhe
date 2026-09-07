import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type StyleSpecification,
  type ExpressionSpecification,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { Story, StoryEvent } from '../shared/schema';
import { smoothRoute, routeThroughAnchor } from './map/routeGeometry';
import { elevationStops } from './map/elevation';

export type MapHandle = {
  fit: () => void;
  zoom: (delta: number) => void;
  getView: () => Story['view'] | undefined;
};
type Props = {
  story: Story;
  selected: StoryEvent | undefined;
  onSelect: (id: string) => void;
  onPoint: (point: {
    coordinates: [number, number];
    elevation: number | null;
    modernRegion?: string;
  }) => void;
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
const landforms: [string, [number, number]][] = [
  ['四 川 盆 地', [105.5, 30.5]],
  ['华 北 平 原', [115.8, 35.7]],
  ['江 汉 平 原', [113.2, 30.2]],
  ['青 藏 高 原', [91.5, 33.3]],
  ['黄 土 高 原', [108, 36.5]],
];
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
function style(): StyleSpecification {
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: '/data/land.geojson' },
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 14,
        attribution:
          '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Elevation: Mapzen / AWS</a>',
      },
      admin: {
        type: 'geojson',
        data: '/data/admin.geojson',
        attribution: 'Modern provinces: Natural Earth',
      },
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
        id: 'elevation',
        type: 'color-relief',
        source: 'dem',
        layout: { visibility: 'none' },
        paint: {
          'color-relief-opacity': 0.86,
          'color-relief-color': [
            'interpolate',
            ['linear'],
            ['elevation'],
            -12000,
            '#dce5df',
            -1,
            '#dce5df',
            ...elevationStops.flat(),
          ] as ExpressionSpecification,
        },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        layout: { visibility: 'none' },
        paint: {
          'hillshade-exaggeration': 0.32,
          'hillshade-shadow-color': '#4e4838',
          'hillshade-highlight-color': '#fff9e9',
          'hillshade-accent-color': '#807251',
          'hillshade-illumination-anchor': 'map',
        },
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
        id: 'admin-fill',
        type: 'fill',
        source: 'admin',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#736278', 'fill-opacity': 0.025 },
      },
      {
        id: 'admin-boundaries',
        type: 'line',
        source: 'admin',
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: {
          'line-color': '#786779',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 7, 1.6],
          'line-opacity': 0.65,
          'line-dasharray': [5, 3],
        },
      },
      {
        id: 'route-shadow',
        type: 'line',
        source: 'routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#faf6ed', 'line-width': 5, 'line-opacity': 0.7 },
      },
      {
        id: 'routes',
        type: 'line',
        source: 'routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-dasharray': [1, 3],
          'line-opacity': 0.85,
        },
      },
      {
        id: 'progress',
        type: 'line',
        source: 'progress',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
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
  const [regions, setRegions] = useState<{ name: string; center: [number, number] }[]>([]);
  const [adminError, setAdminError] = useState(false);
  const failedSources = useRef(new Set<string>());
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
      if (sourceId === 'relief' || sourceId === 'dem' || sourceId === 'terrain-dem') {
        failedSources.current.add(sourceId);
        setOffline(true);
      }
    });
    m.on('sourcedata', (event) => {
      if (event.sourceId && event.sourceDataType === 'content') {
        failedSources.current.delete(event.sourceId);
        setOffline(failedSources.current.size > 0);
      }
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
        modernRegion: currentStory.current.layers.admin
          ? m.queryRenderedFeatures(event.point, { layers: ['admin-fill'] })[0]?.properties?.name
          : undefined,
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
    const controller = new AbortController();
    fetch('/data/admin.geojson', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Administrative data unavailable');
        return response.json();
      })
      .then((data: FeatureCollection) =>
        setRegions(
          data.features.map((f) => ({
            name: String(f.properties?.name),
            center: f.properties?.center,
          })),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setAdminError(true);
      });
    return () => controller.abort();
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
    const curves = story.routes.map((route) => ({
      ...route,
      curve: smoothRoute(route.coordinates),
    }));
    (m.getSource('routes') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: curves.map((r) => ({
        type: 'Feature',
        properties: { color: r.color },
        geometry: { type: 'LineString', coordinates: r.curve.coordinates },
      })),
    });
    const selectedIndex = story.events.findIndex((e) => e.id === selected?.id);
    // Only infer progress when each waypoint still matches the event sequence.
    const eventRoute = curves.find(
      (r) =>
        r.coordinates.length === story.events.length &&
        r.coordinates.every(
          (p, i) =>
            p[0] === story.events[i].coordinates[0] && p[1] === story.events[i].coordinates[1],
        ),
    );
    const progress = eventRoute ? routeThroughAnchor(eventRoute.curve, selectedIndex) : [];
    (m.getSource('progress') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features:
        progress.length > 1
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: progress },
              },
            ]
          : [],
    });
    for (const id of ['routes', 'route-shadow', 'progress'])
      m.setLayoutProperty(id, 'visibility', story.layers.routes ? 'visible' : 'none');
    m.setLayoutProperty('rivers', 'visibility', story.layers.rivers ? 'visible' : 'none');
    for (const id of ['elevation', 'hillshade'])
      m.setLayoutProperty(id, 'visibility', story.layers.elevation ? 'visible' : 'none');
    for (const id of ['admin-fill', 'admin-boundaries'])
      m.setLayoutProperty(id, 'visibility', story.layers.admin ? 'visible' : 'none');
    if (story.layers.terrain) {
      // Terrain and painted DEM layers use different tile resolutions in MapLibre.
      // Separate sources prevent the 3D mesh from reducing color/hillshade quality.
      if (!m.getSource('terrain-dem'))
        m.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          encoding: 'terrarium',
          maxzoom: 14,
          attribution: 'Elevation: Mapzen / AWS',
        });
      m.setTerrain({ source: 'terrain-dem', exaggeration: 1.3 });
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
    if (story.layers.admin)
      regions.forEach((region) => {
        const el = document.createElement('span');
        el.className = 'admin-label';
        el.textContent = region.name;
        add(el, region.center);
      });
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
    if (story.layers.mountains && story.layers.elevation)
      landforms.forEach(([label, coordinates]) => {
        const el = document.createElement('span');
        el.className = 'landform-label';
        el.textContent = label;
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
  }, [ready, story.events, story.markers, story.routes, story.layers, selected, regions]);
  return (
    <>
      <div className="map-canvas" ref={container} aria-label="交互式故事地图" />
      {offline && <div className="map-network">在线地形暂不可用 · 本地地理底图仍可浏览</div>}
      {adminError && story.layers.admin && (
        <div className="map-network">行政区数据加载失败，请刷新重试</div>
      )}
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
