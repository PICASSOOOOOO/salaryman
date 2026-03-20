import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, PhoneOff, Loader2, X, MicOff } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform, INPUT_STYLE } from './PhoneLayout';
import {
  crt, red, amber, blue, purple, formatPhone,
  type ConferenceRoom,
} from '@/lib/phone-utils';

const ROOM_COLORS = [crt, blue, purple, amber];

export default function PhoneConferencePage() {
  const BASE = import.meta.env.BASE_URL;
  useAuth();

  const [conferences, setConferences] = useState<ConferenceRoom[]>([]);
  const [confRoomName, setConfRoomName] = useState('');
  const [confAddNumber, setConfAddNumber] = useState('');
  const [confAddName, setConfAddName] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const fetchConferences = useCallback(() => {
    fetch(apiUrl('twilio/conference/list'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rooms) setConferences(d.rooms); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiUrl]);

  useEffect(() => { fetchConferences(); }, [fetchConferences]);

  const createConference = async () => {
    setCreating(true);
    try {
      const r = await fetch(apiUrl('twilio/conference/create'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: confRoomName || 'New Conference' }),
      });
      if (r.ok) { fetchConferences(); setConfRoomName(''); }
    } catch {}
    setCreating(false);
  };

  const addToConference = async (roomName: string) => {
    if (!confAddNumber) return;
    try {
      await fetch(apiUrl(`twilio/conference/${encodeURIComponent(roomName)}/add`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: confAddNumber, name: confAddName }),
      });
      setConfAddNumber(''); setConfAddName('');
      fetchConferences();
    } catch {}
  };

  const endConference = async (roomName: string) => {
    try {
      await fetch(apiUrl(`twilio/conference/${encodeURIComponent(roomName)}/end`), { method: 'POST' });
      fetchConferences();
    } catch {}
  };

  const parseParticipants = (json: string | null): Array<{ phone: string; name: string; callSid: string; muted: boolean }> => {
    try { return JSON.parse(json ?? '[]'); } catch { return []; }
  };

  const totalParticipants = conferences.reduce((a, r) => a + parseParticipants(r.participantsJson).length, 0);
  const activeRooms = conferences.filter(r => r.status === 'active').length;

  return (
    <PhonePageLayout
      title="CONFERENCE"
      subtitle="Multi-party conference room management and participant control"
      icon={<Users size={24} style={{ color: crt(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MiniWaveform active={activeRooms > 0} bars={4} color={blue} />
          <span style={{ color: activeRooms > 0 ? blue(0.5) : crt(0.2) }}>
            {activeRooms > 0 ? `${activeRooms} ACTIVE ROOM${activeRooms !== 1 ? 'S' : ''}` : 'NO ACTIVE ROOMS'}
          </span>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: red(0.05), border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="CONFERENCE ROOMS" value={conferences.length} />
        <StatBlock label="ACTIVE" value={activeRooms} color={activeRooms > 0 ? crt : undefined} sub={activeRooms > 0 ? 'in session' : 'idle'} />
        <StatBlock label="PARTICIPANTS" value={totalParticipants} color={blue} sub="connected" />
        <StatBlock label="CAPACITY" value="∞" color={purple} sub="unlimited" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard glow={creating}>
            <PhoneCardHeader accent={creating ? amber(0.5) : undefined}>
              {creating ? 'CREATING ROOM...' : 'CREATE CONFERENCE ROOM'}
            </PhoneCardHeader>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>ROOM NAME</label>
                <input
                  value={confRoomName}
                  onChange={e => setConfRoomName(e.target.value)}
                  placeholder="e.g. Sales Standup, Client Review..."
                  style={INPUT_STYLE}
                  onKeyDown={e => e.key === 'Enter' && createConference()}
                />
              </div>
              <PhoneBtn onClick={createConference} disabled={creating} color={(o: number) => `rgba(0,220,60,${o})`} glow={!creating} style={{ justifyContent: 'center', height: 44 }} size="lg">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? 'CREATING...' : 'CREATE ROOM'}
              </PhoneBtn>
            </div>
          </PhoneCard>

          {selectedRoom && (
            <PhoneCard glow>
              <PhoneCardHeader accent={blue(0.5)}>ADD PARTICIPANT TO "{selectedRoom}"</PhoneCardHeader>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>NAME</label>
                  <input value={confAddName} onChange={e => setConfAddName(e.target.value)} placeholder="Participant name..." style={INPUT_STYLE} />
                </div>
                <div>
                  <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>PHONE NUMBER *</label>
                  <input value={confAddNumber} onChange={e => setConfAddNumber(e.target.value)} placeholder="+1 555 000 0000" style={INPUT_STYLE} onKeyDown={e => { if (e.key === 'Enter' && confAddNumber) addToConference(selectedRoom); }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <PhoneBtn onClick={() => addToConference(selectedRoom)} disabled={!confAddNumber} color={blue} style={{ flex: 1, justifyContent: 'center' }}>
                    <Plus size={12} /> ADD TO ROOM
                  </PhoneBtn>
                  <PhoneBtn onClick={() => { setSelectedRoom(null); setConfAddNumber(''); setConfAddName(''); }} color={red} size="sm">
                    <X size={12} />
                  </PhoneBtn>
                </div>
              </div>
            </PhoneCard>
          )}

          <PhoneCard>
            <PhoneCardHeader>CONFERENCE TIPS</PhoneCardHeader>
            <div style={{ padding: 14 }}>
              {[
                ['CREATE', 'Start a new conference room with a label'],
                ['ADD', 'Dial participants into the room by phone number'],
                ['MANAGE', 'Mute/unmute or remove participants in real time'],
                ['END', 'Close the room to disconnect all participants'],
              ].map(([step, desc]) => (
                <div key={step} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.45rem', color: blue(0.6), letterSpacing: '0.15em', marginBottom: 2 }}>{step}</div>
                  <div style={{ fontSize: '0.5rem', color: crt(0.3) }}>{desc}</div>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>

        <PhoneCard>
          <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>CONFERENCE ROOMS</span>
            <span style={{ color: crt(0.4), fontVariantNumeric: 'tabular-nums' }}>{conferences.length} ROOMS</span>
          </PhoneCardHeader>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.6rem', color: crt(0.3), letterSpacing: '0.15em' }}>LOADING CONFERENCES...</div>
          ) : conferences.length === 0 ? (
            <EmptyState message="NO CONFERENCE ROOMS — CREATE ONE TO START A MULTI-PARTY CALL" icon={<Users size={32} />} />
          ) : (
            conferences.map((room, ri) => {
              const participants = parseParticipants(room.participantsJson);
              const isSelected = selectedRoom === room.roomName;
              const isActive = room.status === 'active';
              const colorFn = ROOM_COLORS[ri % ROOM_COLORS.length];
              return (
                <div key={room.id} style={{
                  borderBottom: `1px solid ${crt(0.06)}`,
                  background: isSelected ? blue(0.03) : 'transparent',
                  transition: 'background 0.15s',
                }}>
                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: `linear-gradient(135deg, ${colorFn(isActive ? 0.12 : 0.05)}, transparent)`,
                        border: `1px solid ${colorFn(isActive ? 0.25 : 0.1)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isActive ? `0 0 12px ${colorFn(0.08)}` : 'none',
                        position: 'relative',
                      }}>
                        <Users size={18} style={{ color: colorFn(isActive ? 0.7 : 0.3) }} />
                        <div style={{
                          position: 'absolute', bottom: -2, right: -2,
                          width: 10, height: 10, borderRadius: '50%',
                          background: isActive ? crt(0.8) : crt(0.2),
                          border: '2px solid rgba(0,10,0,0.8)',
                          boxShadow: isActive ? `0 0 6px ${crt(0.4)}` : 'none',
                          animation: isActive ? 'pulse 2s infinite' : 'none',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: crt(0.9), wordBreak: 'break-all' }}>{room.roomName}</div>
                        <div style={{ fontSize: '0.48rem', color: crt(0.3), marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{
                            padding: '1px 6px', borderRadius: 3,
                            background: isActive ? crt(0.06) : crt(0.03),
                            border: `1px solid ${isActive ? crt(0.2) : crt(0.08)}`,
                            color: isActive ? crt(0.7) : crt(0.3),
                          }}>
                            {room.status.toUpperCase()}
                          </span>
                          <span>{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
                        </div>
                        {participants.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {participants.map((p, i) => (
                              <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '6px 10px', borderRadius: 6,
                                background: 'rgba(0,10,0,0.4)',
                                border: `1px solid ${crt(0.06)}`,
                              }}>
                                <div style={{
                                  width: 24, height: 24, borderRadius: 6,
                                  background: `linear-gradient(135deg, ${ROOM_COLORS[(ri + i) % ROOM_COLORS.length](0.1)}, transparent)`,
                                  border: `1px solid ${ROOM_COLORS[(ri + i) % ROOM_COLORS.length](0.15)}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.55rem', color: ROOM_COLORS[(ri + i) % ROOM_COLORS.length](0.6),
                                  flexShrink: 0,
                                }}>
                                  {(p.name?.[0] || '#').toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: '0.55rem', color: crt(0.6) }}>{p.name || 'Unknown'}</span>
                                  <span style={{ fontSize: '0.45rem', color: crt(0.25), marginLeft: 8 }}>{formatPhone(p.phone)}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {p.muted ? (
                                    <MicOff size={10} style={{ color: amber(0.6) }} />
                                  ) : (
                                    <MiniWaveform active bars={3} />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <PhoneBtn onClick={() => setSelectedRoom(isSelected ? null : room.roomName)} color={blue} size="sm" title="Add participant">
                          <Plus size={12} />
                        </PhoneBtn>
                        <PhoneBtn onClick={() => endConference(room.roomName)} color={red} size="sm" title="End conference">
                          <PhoneOff size={12} />
                        </PhoneBtn>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </PhoneCard>
      </div>
    </PhonePageLayout>
  );
}
