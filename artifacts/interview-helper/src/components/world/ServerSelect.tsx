import { useState, useEffect } from 'react';
import { PLANNED_CITIES, SERVER_REGIONS, type CityEntry } from '@/lib/world-servers';

interface ServerSelectProps {
  onSelect: (city: CityEntry) => void;
  onBack: () => void;
}

const FONT_MONO = "'Share Tech Mono', monospace";
const FONT_VT = "'VT323', monospace";

export default function ServerSelect({ onSelect, onBack }: ServerSelectProps) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [expandedRegion, setExpandedRegion] = useState<string | null>('americas');

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 800);
    return () => clearInterval(t);
  }, []);

  const displayCity = hoveredCity ? PLANNED_CITIES.find(c => c.cityId === hoveredCity) ?? null : null;
  const minxCity = PLANNED_CITIES.find(c => c.cityId === 'minx_city')!;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050a12 0%, #0a1020 40%, #0c0818 100%)',
      fontFamily: FONT_MONO,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '1.5rem 1rem',
      overflow: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <div style={{
              fontFamily: FONT_VT,
              fontSize: 'clamp(2rem, 5vw, 3.2rem)',
              letterSpacing: '.18em',
              background: 'linear-gradient(90deg, #38bdf8, #a855f7, #f59e0b, #22c55e)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 20px rgba(168,85,247,.3))',
            }}>
              MINX CITY NETWORK
            </div>
            <div style={{
              fontSize: '.6rem',
              color: 'rgba(255,255,255,.3)',
              letterSpacing: '.15em',
              marginTop: '.2rem',
            }}>
              11 SERVERS PLANNED · WORLDWIDE · 1 LIVE {tick % 2 === 0 ? '▸' : '▹'}
            </div>
          </div>
          <button
            onClick={onBack}
            style={{
              padding: '.4rem .8rem',
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.12)',
              color: 'rgba(255,255,255,.35)',
              cursor: 'pointer',
              fontSize: '.55rem',
              letterSpacing: '.08em',
              fontFamily: FONT_MONO,
              marginTop: '.5rem',
            }}
          >
            ← BACK
          </button>
        </div>

        <div style={{
          marginBottom: '1.25rem',
          padding: '.85rem 1rem',
          background: minxCity.bgGradient,
          border: `1.5px solid ${minxCity.accentColor}60`,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          cursor: 'pointer',
          boxShadow: `0 0 30px ${minxCity.accentColor}15, inset 0 0 40px ${minxCity.accentColor}05`,
          transition: 'all .2s',
        }}
          onClick={() => onSelect(minxCity)}
        >
          <div style={{ fontSize: '2rem' }}>{minxCity.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{
                fontFamily: FONT_VT,
                fontSize: '1.6rem',
                color: minxCity.accentColor,
                letterSpacing: '.12em',
                textShadow: `0 0 15px ${minxCity.accentColor}50`,
              }}>
                {minxCity.cityName}
              </span>
              <span style={{
                padding: '2px 8px',
                background: 'rgba(34,197,94,.15)',
                border: '1px solid rgba(34,197,94,.5)',
                color: '#22c55e',
                fontSize: '.45rem',
                letterSpacing: '.12em',
                fontFamily: FONT_MONO,
              }}>
                ● LIVE
              </span>
            </div>
            <div style={{ fontSize: '.5rem', color: `${minxCity.accentColor}70`, letterSpacing: '.1em', marginTop: '.15rem' }}>
              {minxCity.tagline} — {minxCity.region}
            </div>
            <div style={{ fontSize: '.5rem', color: 'rgba(255,255,255,.3)', lineHeight: 1.6, marginTop: '.3rem' }}>
              {minxCity.description}
            </div>
          </div>
          <div style={{
            fontFamily: FONT_VT,
            fontSize: '1.1rem',
            color: minxCity.accentColor,
            letterSpacing: '.15em',
            opacity: tick % 2 === 0 ? 1 : .5,
            transition: 'opacity .3s',
          }}>
            ENTER ▶
          </div>
        </div>

        <div style={{
          fontSize: '.55rem',
          color: 'rgba(255,255,255,.2)',
          letterSpacing: '.12em',
          marginBottom: '.75rem',
          borderTop: '1px solid rgba(255,255,255,.06)',
          paddingTop: '.75rem',
        }}>
          COMING SOON — FUTURE SERVERS
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            {SERVER_REGIONS.map(region => {
              const futureCities = region.cities.filter((c: CityEntry) => !c.isLive);
              if (futureCities.length === 0) return null;
              return (
                <div key={region.id} style={{ marginBottom: '.5rem' }}>
                  <button
                    onClick={() => setExpandedRegion(expandedRegion === region.id ? null : region.id)}
                    style={{
                      width: '100%',
                      padding: '.5rem .75rem',
                      background: expandedRegion === region.id ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.02)',
                      border: expandedRegion === region.id ? '1px solid rgba(255,255,255,.15)' : '1px solid rgba(255,255,255,.06)',
                      color: expandedRegion === region.id ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.35)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: FONT_VT,
                      fontSize: '.95rem',
                      letterSpacing: '.1em',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all .2s',
                    }}
                  >
                    <span>{region.label}</span>
                    <span style={{ fontSize: '.55rem', fontFamily: FONT_MONO, color: 'rgba(255,255,255,.2)' }}>
                      {futureCities.length} {futureCities.length === 1 ? 'SERVER' : 'SERVERS'} {expandedRegion === region.id ? '▾' : '▸'}
                    </span>
                  </button>

                  {expandedRegion === region.id && (
                    <div style={{ padding: '.25rem 0' }}>
                      {futureCities.map((city: CityEntry) => {
                        const isHovered = hoveredCity === city.cityId;
                        return (
                          <div
                            key={city.cityId}
                            onMouseEnter={() => setHoveredCity(city.cityId)}
                            onMouseLeave={() => setHoveredCity(null)}
                            style={{
                              width: '100%',
                              padding: '.65rem .75rem',
                              marginTop: '.3rem',
                              background: isHovered ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.015)',
                              border: '1px solid rgba(255,255,255,.06)',
                              textAlign: 'left',
                              fontFamily: FONT_MONO,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '.65rem',
                              transition: 'all .2s',
                              opacity: .6,
                            }}
                          >
                            <span style={{ fontSize: '1.3rem', filter: 'grayscale(60%)' }}>
                              {city.icon}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontFamily: FONT_VT,
                                fontSize: '1.05rem',
                                color: isHovered ? `${city.accentColor}90` : 'rgba(255,255,255,.35)',
                                letterSpacing: '.08em',
                                transition: 'color .2s',
                              }}>
                                {city.cityName}
                              </div>
                              <div style={{
                                fontSize: '.45rem',
                                color: 'rgba(255,255,255,.15)',
                                letterSpacing: '.06em',
                                marginTop: '.1rem',
                              }}>
                                {city.region}
                              </div>
                            </div>
                            <span style={{
                              fontSize: '.4rem',
                              color: 'rgba(255,255,255,.15)',
                              letterSpacing: '.1em',
                              fontFamily: FONT_MONO,
                              border: '1px solid rgba(255,255,255,.08)',
                              padding: '2px 6px',
                            }}>
                              SOON
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{
            background: displayCity ? displayCity.bgGradient : 'rgba(255,255,255,.02)',
            border: displayCity ? `1px solid ${displayCity.accentColor}30` : '1px solid rgba(255,255,255,.06)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 300,
            transition: 'all .4s',
            boxShadow: displayCity ? `inset 0 0 60px ${displayCity.accentColor}06` : 'none',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {displayCity ? (
              <>
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: `radial-gradient(circle at 50% 30%, ${displayCity.accentColor}10 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{ fontSize: '3rem', marginBottom: '.75rem', filter: 'grayscale(30%)', opacity: .7 }}>
                  {displayCity.icon}
                </div>
                <div style={{
                  fontFamily: FONT_VT,
                  fontSize: 'clamp(1.3rem, 3vw, 2rem)',
                  color: `${displayCity.accentColor}90`,
                  letterSpacing: '.15em',
                  textAlign: 'center',
                  marginBottom: '.3rem',
                }}>
                  {displayCity.cityName}
                </div>
                <div style={{
                  fontSize: '.55rem',
                  color: `${displayCity.accentColor}50`,
                  letterSpacing: '.2em',
                  fontFamily: FONT_VT,
                  marginBottom: '1rem',
                }}>
                  {displayCity.tagline}
                </div>
                <div style={{
                  fontSize: '.55rem',
                  color: 'rgba(255,255,255,.3)',
                  lineHeight: 1.8,
                  textAlign: 'center',
                  maxWidth: 300,
                  marginBottom: '1rem',
                }}>
                  {displayCity.description}
                </div>
                <div style={{
                  padding: '4px 12px',
                  background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.08)',
                  fontSize: '.45rem',
                  color: 'rgba(255,255,255,.2)',
                  letterSpacing: '.12em',
                }}>
                  COMING SOON
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '.75rem', opacity: .2 }}>🌐</div>
                <div style={{
                  fontFamily: FONT_VT,
                  fontSize: '1.1rem',
                  color: 'rgba(255,255,255,.15)',
                  letterSpacing: '.12em',
                }}>
                  HOVER TO PREVIEW
                </div>
                <div style={{
                  fontSize: '.5rem',
                  color: 'rgba(255,255,255,.1)',
                  marginTop: '.4rem',
                  letterSpacing: '.06em',
                  lineHeight: 1.7,
                }}>
                  10 MORE SERVERS COMING<br />TO CITIES WORLDWIDE
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{
          marginTop: '1rem',
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
          paddingBottom: '1rem',
        }}>
          {PLANNED_CITIES.map(city => (
            <div
              key={city.cityId}
              onMouseEnter={() => !city.isLive ? setHoveredCity(city.cityId) : undefined}
              onMouseLeave={() => setHoveredCity(null)}
              onClick={() => city.isLive ? onSelect(city) : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '.2rem',
                cursor: city.isLive ? 'pointer' : 'default',
                opacity: city.isLive ? 1 : .3,
                transition: 'all .2s',
                transform: hoveredCity === city.cityId ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <div style={{
                width: city.isLive ? 12 : 8,
                height: city.isLive ? 12 : 8,
                borderRadius: '50%',
                background: city.isLive ? city.accentColor : 'rgba(255,255,255,.15)',
                boxShadow: city.isLive ? `0 0 12px ${city.accentColor}` : 'none',
                transition: 'all .3s',
              }} />
              <div style={{
                fontSize: '.33rem',
                color: city.isLive ? city.accentColor : 'rgba(255,255,255,.15)',
                fontFamily: FONT_MONO,
                letterSpacing: '.06em',
                whiteSpace: 'nowrap',
              }}>
                {city.cityName}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
