import { assetUrl } from './runtime';
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
import { journeyFeatures, evidenceLabels } from './map/journeyGeometry';
import { CollapsedAttributionControl } from './map/CollapsedAttributionControl';
import { MapPopupController } from './map/MapPopupController';
import { annotationElement } from './map/annotationElement';
import { Button } from './ui';
import { declutterLabels } from './map/declutterLabels';
import {
  findMajorRiver,
  majorRivers,
  majorRiverLayers,
  riverFilter,
  riverLabelAnchors,
  riverSegmentName,
  type MajorRiver,
} from './map/majorRivers';

export type MapHandle = {
  fit: () => void;
  focusRoute: (routeId: string, legIndex?: number) => void;
  zoom: (delta: number) => void;
  getView: () => Story['view'] | undefined;
};
type Props = {
  story: Story;
  selected: StoryEvent | undefined;
  activeRouteId?: string | null;
  onSelect: (id: string) => void;
  onSelectRoute: (id: string) => void;
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
      land: { type: 'geojson', data: assetUrl('data/land.geojson') },
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
        data: assetUrl('data/admin.geojson'),
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
        data: assetUrl('data/rivers.geojson'),
        attribution:
          '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>',
      },
      'river-labels': { type: 'geojson', data: riverLabelAnchors() },
      routes: { type: 'geojson', data: empty },
      progress: { type: 'geojson', data: empty },
      journeys: { type: 'geojson', data: empty },
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
      ...majorRiverLayers(),
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
      {
        id: 'journey-corridors',
        type: 'line',
        source: 'journeys',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 14, 'line-opacity': 0.15 },
      },
      {
        id: 'journey-lines',
        type: 'line',
        source: 'journeys',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.6,
          'line-opacity': 0.9,
          'line-dasharray': [3, 2.5],
        },
      },
    ],
  };
}

const MapCanvas = forwardRef<MapHandle, Props>(function MapCanvas(
  { story, selected, activeRouteId, onSelect, onSelectRoute, onPoint },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const popups = useRef<MapPopupController | null>(null);
  const callbacks = useRef({ onSelect, onSelectRoute, onPoint });
  callbacks.current = { onSelect, onSelectRoute, onPoint };
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
  const openRiver = (
    river: MajorRiver,
    coordinates: [number, number],
    trigger: HTMLButtonElement | null = null,
    sectionName = river.label,
  ) => {
    const riverNotes = currentStory.current.markers.filter(
      (marker) => marker.kind === 'river' && findMajorRiver(marker.label)?.id === river.id,
    );
    const note =
      riverNotes.find((marker) => marker.label.replaceAll(/\s/g, '') === sectionName) ??
      riverNotes[0];
    const description = [
      river.description,
      '沿现代河道显示的地理参考，不代表故事年代的历史河道。',
      note?.description ? `已保存的故事笔记：${note.description}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
    popups.current?.toggle(
      `river:${river.id}`,
      trigger,
      coordinates,
      sectionName === river.label ? river.label : `${river.label} · ${sectionName}`,
      description,
      'center',
    );
  };
  const focusRoute = (routeId: string, legIndex?: number) => {
    const route = currentStory.current.routes.find((r) => r.id === routeId);
    if (!route || !map.current) return;
    popups.current?.close();
    const leg = legIndex === undefined ? undefined : route.journey?.legs[legIndex];
    const coordinates = leg ? route.coordinates.slice(leg.from, leg.to + 1) : route.coordinates;
    const bounds = new maplibregl.LngLatBounds();
    coordinates.forEach((p) => bounds.extend(p));
    const width = container.current?.clientWidth || 800;
    const height = container.current?.clientHeight || 600;
    map.current.fitBounds(bounds, {
      padding: {
        top: 85,
        bottom: width > 680 ? 90 : Math.round(height * 0.45) + 65,
        left: width > 680 ? 350 : 45,
        right: 65,
      },
      maxZoom: 7,
      duration: motion(),
    });
  };
  const fit = () => {
    const m = map.current;
    if (!m) return;
    popups.current?.close();
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
    focusRoute,
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
        attributionControl: false,
        locale: {
          'AttributionControl.ToggleAttribution': '地图来源与版权',
          'Popup.Close': '关闭地点信息',
        },
        canvasContextAttributes: { antialias: true },
        dragRotate: true,
        maxPitch: 65,
      });
    } catch {
      setFatal(true);
      return;
    }
    map.current = m;
    popups.current = new MapPopupController(m);
    const updateLabelVisibility = () => declutterLabels(m.getContainer());
    m.on('moveend', updateLabelVisibility);
    const onPopupKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && popups.current?.close(true)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    m.getContainer().addEventListener('keydown', onPopupKeyDown);
    m.addControl(new CollapsedAttributionControl({ compact: true }), 'bottom-right');
    const updateLabelDetail = () =>
      container.current?.classList.toggle('journey-detail', m.getZoom() >= 6.5);
    updateLabelDetail();
    m.on('zoom', updateLabelDetail);
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
      const routeId = m.queryRenderedFeatures(event.point, { layers: ['journey-corridors'] })[0]
        ?.properties?.routeId;
      const riverFeature = m.queryRenderedFeatures(event.point, {
        layers: ['major-river-hit', 'major-river-label', 'major-river-anchor-label'],
      })[0];
      const river = findMajorRiver(String(riverFeature?.properties?.name ?? ''));
      if (river && !routeId) {
        openRiver(
          river,
          [event.lngLat.lng, event.lngLat.lat],
          null,
          riverSegmentName(String(riverFeature.properties.name)),
        );
        return;
      }
      // The first background click dismisses a note; it does not open another card.
      if (popups.current?.close()) return;
      if (routeId) {
        callbacks.current.onSelectRoute(String(routeId));
        return;
      }
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
    let hoveredRiver: string | undefined;
    m.on('mousemove', (event) => {
      if (!m.isStyleLoaded()) return;
      const feature = m.queryRenderedFeatures(event.point, {
        layers: ['major-river-hit', 'major-river-label', 'major-river-anchor-label'],
      })[0];
      const river = findMajorRiver(String(feature?.properties?.name ?? ''));
      if (river?.id === hoveredRiver) return;
      hoveredRiver = river?.id;
      m.getCanvas().style.cursor = river ? 'pointer' : '';
      m.setFilter('major-river-hover', riverFilter(river ? [river] : []));
    });
    m.on('mouseout', () => {
      hoveredRiver = undefined;
      m.getCanvas().style.cursor = '';
      if (m.getLayer('major-river-hover')) m.setFilter('major-river-hover', riverFilter([]));
    });
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      m.off('moveend', updateLabelVisibility);
      m.getContainer().removeEventListener('keydown', onPopupKeyDown);
      popups.current?.close();
      popups.current = null;
      markers.current.forEach((v) => v.remove());
      markers.current = [];
      m.remove();
      map.current = null;
      setReady(false);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(assetUrl('data/admin.geojson'), { signal: controller.signal })
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
    else if (selected && previous.selectedId !== selected.id && !activeRouteId)
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
    if (ready && activeRouteId) focusRoute(activeRouteId);
  }, [ready, activeRouteId]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const connections = story.routes.filter(
      (r) => !r.journey && (story.kind === 'travel' || story.layers.connections) && !activeRouteId,
    );
    const curves = connections.map((route) => ({
      ...route,
      curve: smoothRoute(route.coordinates),
    }));
    // A journey belongs to its own dated reading view, not every year in a biography.
    (m.getSource('journeys') as GeoJSONSource).setData(
      activeRouteId ? journeyFeatures(story, activeRouteId) : empty,
    );
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
    for (const id of ['routes', 'route-shadow', 'progress', 'journey-corridors', 'journey-lines'])
      m.setLayoutProperty(id, 'visibility', story.layers.routes ? 'visible' : 'none');
    for (const id of ['rivers', ...majorRiverLayers().map((layer) => layer.id)])
      m.setLayoutProperty(id, 'visibility', story.layers.rivers ? 'visible' : 'none');
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
    popups.current?.close();
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
    const activeRoute = story.routes.find((r) => r.id === activeRouteId);
    if (activeRoute?.journey && story.layers.routes)
      activeRoute.journey.stops.forEach((stop) => {
        const el = document.createElement('button');
        el.className = 'journey-stop ' + stop.evidence;
        const label = document.createElement('span');
        label.textContent = stop.label.split(' · ')[0];
        el.append(label);
        el.setAttribute('aria-label', `${stop.label}，${evidenceLabels[stop.evidence]}，查看依据`);
        el.setAttribute('aria-haspopup', 'dialog');
        el.setAttribute('aria-expanded', 'false');
        el.onclick = (event) => {
          event.stopPropagation();
          popups.current?.toggle(
            `journey:${activeRoute.id}:${stop.at}`,
            el,
            activeRoute.coordinates[stop.at],
            stop.label,
            `${evidenceLabels[stop.evidence]} · ${stop.note}`,
          );
        };
        add(el, activeRoute.coordinates[stop.at], 'bottom');
      });
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
      if (activeRoute) return;
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
        popups.current?.close();
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
      // Recognized river notes belong to their channel, not a separate floating point.
      if (marker.kind === 'river' && findMajorRiver(marker.label)) return;
      if (
        (marker.kind === 'mountain' && !story.layers.mountains) ||
        (marker.kind === 'river' && !story.layers.rivers)
      )
        return;
      const el = annotationElement(marker);
      el.setAttribute('aria-label', marker.label + '，查看地点笔记');
      el.setAttribute('aria-haspopup', 'dialog');
      el.setAttribute('aria-expanded', 'false');
      el.onclick = (e) => {
        e.stopPropagation();
        popups.current?.toggle(
          `marker:${marker.id}`,
          el,
          marker.coordinates,
          marker.label,
          marker.description,
          'center',
        );
      };
      add(el, marker.coordinates);
    });
    declutterLabels(m.getContainer());
  }, [
    ready,
    story.events,
    story.markers,
    story.routes,
    story.layers,
    selected,
    regions,
    activeRouteId,
    story.kind,
  ]);
  return (
    <>
      <div className="map-canvas" ref={container} aria-label="交互式故事地图" />
      {story.layers.rivers && (
        <div className="river-key" aria-label="主要河流，现代河道参考">
          {majorRivers.map((river) => (
            <Button
              key={river.id}
              type="button"
              aria-label={`${river.label}，查看河道说明`}
              aria-haspopup="dialog"
              aria-expanded={false}
              onClick={(event) => {
                const m = map.current;
                if (!m) return;
                m.easeTo({
                  center: river.center,
                  zoom: Math.max(5, m.getZoom()),
                  duration: motion(),
                });
                openRiver(river, river.center, event.currentTarget);
              }}
            >
              <span style={{ backgroundColor: river.color }} aria-hidden="true" />
              {river.label}
            </Button>
          ))}
        </div>
      )}
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
