import { useEffect, useMemo, useState } from 'react';
import {
  getOperationalCities,
  resolveHomeCity,
  getLocalTimezone,
  type CityEntry,
} from '@/lib/world-servers';

interface LocateResult {
  country: string | null;
  timezone: string | null;
  region: string | null;
}

interface PopulationResult {
  cityId: string;
  region: string;
  online: number;
  max: number;
}

const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };

// Realm-selection step of the immigration flow. The player is SHOWN a suggested
// home city derived from their (coarse, IP-based) location & continent, but is
// FREE to settle in any operational city. Live capacity (online / cap) is shown
// for the realm this deployment hosts; sibling realms show their cap only since
// their live count lives on a different server. Storing the coarse location is
// strictly opt-in.
export function CityImmigrationPanel({
  onConfirm,
}: {
  onConfirm: (cityId: string, consent: boolean, coarseLocation: string | null) => void;
}) {
  const cities = useMemo<CityEntry[]>(() => getOperationalCities(), []);
  const [locate, setLocate] = useState<LocateResult | null>(null);
  const [population, setPopulation] = useState<PopulationResult | null>(null);
  const [selected, setSelected] = useState<string>(() => cities[0]?.cityId ?? '');
  const [consent, setConsent] = useState(false);
  const [ready, setReady] = useState(false);

  // Detect location (IP first, browser-timezone fallback) + this realm's load.
  useEffect(() => {
    let alive = true;
    (async () => {
      let loc: LocateResult = { country: null, timezone: null, region: null };
      try {
        const r = await fetch('/api/world/locate', { credentials: 'include' });
        if (r.ok) loc = await r.json() as LocateResult;
      } catch { /* dev/local IP won't resolve — fall back below */ }
      try {
        const r = await fetch('/api/world/population', { credentials: 'include' });
        if (r.ok && alive) setPopulation(await r.json() as PopulationResult);
      } catch { /* non-fatal — caps still render from the static catalog */ }
      if (!alive) return;
      setLocate(loc);
      const tz = loc.timezone || getLocalTimezone();
      const suggestion = resolveHomeCity(tz);
      if (suggestion) setSelected(suggestion.city.cityId);
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const suggestion = useMemo(() => {
    const tz = locate?.timezone || getLocalTimezone();
    return resolveHomeCity(tz);
  }, [locate]);

  const suggestedId = suggestion?.city.cityId ?? null;

  // The country shown to the player for transparency. We pass it along only as a
  // hint — the SERVER re-derives + stores country-only from the request IP when
  // consent is given, so it can never store anything finer than country.
  const coarseLocation = useMemo<string | null>(() => locate?.country ?? null, [locate]);

  const originLine = (() => {
    if (!ready) return 'LOCATING…';
    if (locate?.country) return `DETECTED ORIGIN · ${locate.country}${locate.region ? ` / ${locate.region}` : ''}`;
    return 'ORIGIN UNKNOWN · USING DEVICE TIMEZONE';
  })();

  const capacityLabel = (c: CityEntry): string => {
    if (population && population.cityId === c.cityId) {
      return `${population.online} / ${population.max} ONLINE`;
    }
    return `CAP ${c.maxPlayers}`;
  };

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 440, padding: '2.8rem 1rem 2.2rem',
    }}>
      <div style={{
        width: 560, maxWidth: 'min(94vw, 560px)', maxHeight: 'calc(100vh - 5rem)',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(0,5,0,.99)',
        border: '1px solid rgba(56,189,248,.5)',
        boxShadow: '0 0 60px rgba(56,189,248,.1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '.55rem .85rem',
          borderBottom: '1px solid rgba(56,189,248,.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ ...VT, fontSize: '1.3rem', color: '#38bdf8', letterSpacing: '.18em' }}>
              PABLO CORP — REALM ASSIGNMENT
            </div>
            <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>
              SUGGESTED BY YOUR LOCATION &amp; CONTINENT · YOU MAY SETTLE IN ANY OPEN CITY
            </div>
          </div>
          <div style={{
            width: 32, height: 32,
            border: '1px solid rgba(56,189,248,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...VT, fontSize: '1.2rem', color: '#38bdf8',
          }}>P</div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '.9rem 1.1rem' }}>
          <div style={{
            ...ST, fontSize: '.55rem', letterSpacing: '.12em',
            color: 'rgba(125,211,252,.6)', marginBottom: '.7rem',
          }}>
            &gt; {originLine}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '.6rem' }}>
            {cities.map((c) => {
              const isSel = c.cityId === selected;
              const isSuggested = c.cityId === suggestedId;
              return (
                <button
                  key={c.cityId}
                  type="button"
                  onClick={() => setSelected(c.cityId)}
                  data-testid={`city-option-${c.cityId}`}
                  style={{
                    textAlign: 'left',
                    padding: '.7rem .85rem',
                    border: `1px solid ${isSel ? c.accentColor : 'rgba(56,189,248,.22)'}`,
                    background: isSel ? `${c.accentColor}1a` : 'rgba(56,189,248,.03)',
                    cursor: 'pointer',
                    transition: 'border-color .15s, background .15s',
                    display: 'flex', alignItems: 'center', gap: '.75rem',
                  }}
                >
                  <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>{c.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                      <span style={{ ...VT, fontSize: '1.05rem', color: isSel ? '#fff' : '#7dd3fc', letterSpacing: '.12em' }}>
                        {c.cityName}
                      </span>
                      {isSuggested && (
                        <span style={{
                          ...ST, fontSize: '.42rem', letterSpacing: '.14em',
                          color: '#04060a', background: c.accentColor,
                          padding: '.08rem .35rem', borderRadius: 2,
                        }}>
                          SUGGESTED
                        </span>
                      )}
                    </div>
                    <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(125,211,252,.45)', letterSpacing: '.08em', marginTop: '.18rem' }}>
                      {c.region} · {c.tagline}
                    </div>
                  </div>
                  <div style={{
                    ...ST, fontSize: '.5rem', letterSpacing: '.1em', whiteSpace: 'nowrap',
                    color: isSel ? c.accentColor : 'rgba(56,189,248,.5)',
                  }}>
                    {capacityLabel(c)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Consent */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: '.55rem',
            marginTop: '.95rem', padding: '.6rem .7rem',
            border: '1px solid rgba(56,189,248,.18)',
            background: 'rgba(56,189,248,.02)',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              data-testid="location-consent"
              style={{ marginTop: '.15rem', accentColor: '#38bdf8' }}
            />
            <span style={{ ...ST, fontSize: '.5rem', lineHeight: 1.75, color: 'rgba(125,211,252,.6)', letterSpacing: '.06em' }}>
              Let PABLO CORP remember my <b style={{ color: '#7dd3fc' }}>approximate (country-level)</b> location to improve
              error reports &amp; research. Optional — leave unchecked to decline. Nothing finer than country is ever stored.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div style={{
          padding: '.7rem .9rem',
          borderTop: '1px solid rgba(56,189,248,.2)',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '.6rem',
        }}>
          <button
            type="button"
            onClick={() => onConfirm(selected, consent, consent ? coarseLocation : null)}
            disabled={!selected}
            data-testid="confirm-home-city"
            style={{
              padding: '.55rem 1.1rem',
              border: `1px solid ${selected ? 'rgba(56,189,248,.7)' : 'rgba(56,189,248,.2)'}`,
              background: selected ? 'rgba(56,189,248,.12)' : 'transparent',
              color: selected ? '#7dd3fc' : 'rgba(56,189,248,.3)',
              ...VT, fontSize: '1rem', letterSpacing: '.18em',
              cursor: selected ? 'pointer' : 'not-allowed',
              transition: 'background .2s, color .2s, border-color .2s',
            }}
          >
            SETTLE HERE ▸
          </button>
        </div>
      </div>
    </div>
  );
}
