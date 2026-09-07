import { Route, X, LocateFixed, ExternalLink, Footprints, Ship, CircleHelp } from 'lucide-react';
import type { MapRoute } from '../shared/schema';
import { evidenceLabels, transportLabels } from './map/journeyGeometry';
import { Button, Disclosure, Select } from './ui';

export default function JourneyPanel({
  route,
  routes,
  onChange,
  onFocus,
  onClose,
}: {
  route: MapRoute;
  routes: MapRoute[];
  onChange: (id: string) => void;
  onFocus: (leg?: number) => void;
  onClose: () => void;
}) {
  const journey = route.journey!;
  return (
    <article className="journey-panel" aria-label="行程依据">
      <header>
        <Route size={16} />
        <strong>行程考证</strong>
        <span>{journey.status === 'reconstructed' ? '概略重建' : '待核验'}</span>
        <Button className="icon-button" aria-label="关闭行程考证" onClick={onClose}>
          <X size={16} />
        </Button>
      </header>
      <label className="sr-only" htmlFor="journey-picker">
        选择行程
      </label>
      <Select
        id="journey-picker"
        label="选择行程"
        value={route.id}
        onValueChange={onChange}
        options={routes.map((r) => ({ value: r.id, label: r.label }))}
      />
      <div className="journey-period">
        <span>
          {journey.startYear} 年出发 · {journey.endYear} 年抵达
        </span>
        <Button onClick={() => onFocus()}>
          <LocateFixed size={13} /> 全程
        </Button>
      </div>
      <div className="journey-legs">
        {journey.legs.map((leg, index) => {
          const Icon = leg.mode === 'water' ? Ship : leg.mode === 'land' ? Footprints : CircleHelp;
          return (
            <Disclosure
              key={index}
              title={
                <>
                  <Icon size={15} />
                  <span>
                    {leg.label}
                    <small>
                      {transportLabels[leg.mode]} · {evidenceLabels[leg.evidence]}
                    </small>
                  </span>
                </>
              }
            >
              <p>{leg.note}</p>
              <p className="journey-waypoints">
                {journey.stops
                  .filter((s) => s.at >= leg.from && s.at <= leg.to)
                  .map((s) => s.label.split(' · ')[0])
                  .join(' → ')}
              </p>
              <Button className="journey-focus" onClick={() => onFocus(index)}>
                <LocateFixed size={13} /> 在地图上看这一段
              </Button>
            </Disclosure>
          );
        })}
      </div>
      <div className="journey-warning">概略走廊 · 地点有出处，不代表其间道路已复原。</div>
      <p className="journey-summary">{journey.summary}</p>
      <div className="journey-sources">
        <strong>资料依据</strong>
        {journey.sources.length ? (
          journey.sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.title}
              <ExternalLink size={12} />
            </a>
          ))
        ) : (
          <p>尚无核验过的资料来源。</p>
        )}
      </div>
    </article>
  );
}
