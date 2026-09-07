import type { FeatureCollection, LineString } from 'geojson';
import type { Story } from '../../shared/schema';

export const transportColors = { land: '#a66e46', water: '#397f94', unknown: '#777c76' };
export const transportLabels = { land: '陆路', water: '水路', unknown: '水陆细节待考' };
export const evidenceLabels = {
  referenced: '有资料提及',
  inferred: '研究推定',
  unknown: '尚待考证',
};

/** Historical corridors keep their supplied geometry: smoothing cannot add evidence. */
export function journeyFeatures(
  story: Story,
  activeRouteId?: string | null,
): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: story.routes
      .filter((r) => r.journey && (!activeRouteId || r.id === activeRouteId))
      .flatMap((r) =>
        r.journey!.legs.map((leg, i) => ({
          type: 'Feature' as const,
          properties: {
            routeId: r.id,
            leg: i,
            label: leg.label,
            mode: leg.mode,
            evidence: leg.evidence,
            color: transportColors[leg.mode],
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: r.coordinates.slice(leg.from, leg.to + 1),
          },
        })),
      ),
  };
}
