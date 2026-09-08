import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from 'react';
import { PhoneOff, Mic, MicOff, PauseCircle, PlayCircle, ArrowRightLeft, ChevronUp, ChevronDown, X, Phone } from 'lucide-react';
import { useActiveCallContext } from '@/contexts/ActiveCallContext';
import { SignalMeter } from '@/pages/phone/PhoneLayout';
import {
  slate, destructive, warning, primary, ENDED_STATUSES, formatPhone, callStatusToSignalLevel } from '@/lib/phone-utils';
import { useBoomerMode } from '@/hooks/use-mobile';

const FONT = "var(--font-sans)";

function ElapsedCompact({ seconds, boomer = false }: { seconds: number; boomer?: boolean }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <span style={{
      fontFamily: boomer ? undefined : FONT,
      fontSize: '0.65rem',
      color: slate(0.85),
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '0.08em' }}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

function TransferInput({
  onConfirm,
  onCancel,
  boomer = false }: {
  onConfirm: (num: string) => void;
  onCancel: () => void;
  boomer?: boolean;
}) {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 12px', borderTop: `1px solid ${primary(0.15)}`, background: primary(0.04) }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Transfer to number..."
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onConfirm(val); if (e.key === 'Escape') onCancel(); }}
        autoFocus
        style={{
          flex: 1, background: slate(0.5), border: `1px solid ${primary(0.25)}`, borderRadius: 4,
           color: '#050505', fontSize: '16px', padding: '10px 12px', minHeight: 44, outline: 'none',
          fontFamily: boomer ? undefined : FONT }}
      />
      <button
        onClick={() => { if (val.trim()) onConfirm(val); }}
        style={{
          background: primary(0.15), border: `1px solid ${primary(0.35)}`, borderRadius: 4,
           color: '#050505', fontSize: '0.72rem', padding: '8px 12px', minHeight: 44, minWidth: 54, cursor: 'pointer',
          fontFamily: boomer ? undefined : FONT, letterSpacing: '0.08em' }}
      >XFER</button>
      <button
        onClick={onCancel}
         style={{ background: 'none', border: '1px solid #222', color: '#050505', cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44 }}
       ><X size={18} /></button>
    </div>
  );
}

function CallRow({
  call,
  onMute,
  onHold,
  onTransfer,
  onHangup,
  boomer = false }: {
  call: { callSid: string; name: string; phone: string; status: string; elapsed: number; muted?: boolean; onHold?: boolean; signalLevel?: number };
  onMute: () => void;
  onHold: () => void;
  onTransfer: () => void;
  onHangup: () => void;
  boomer?: boolean;
}) {
  const isLive = call.status === 'in-progress';
  const isRinging = call.status === 'ringing';
  const sig = call.signalLevel ?? callStatusToSignalLevel(call.status);
  const accentColor = isLive ? slate : isRinging ? warning : slate;

  const btnBase: React.CSSProperties = {
    background: 'none',
    border: `1px solid ${slate(0.12)}`,
    borderRadius: 4,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
    transition: 'all 0.15s' };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 14px',
      borderBottom: `1px solid ${slate(0.05)}` }}>
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: slate(0.02),
        border: `1px solid ${accentColor(0.2)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative' }}>
        {isRinging ? (
          <Phone size={13} style={{ color: warning(0.8), animation: 'pulse 0.5s infinite' }} />
        ) : (
          <span style={{ fontSize: '0.75rem', color: accentColor(0.7) }}>
            {call.name?.[0]?.toUpperCase() || '#'}
          </span>
        )}
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 7, height: 7, borderRadius: '50%',
          background: isLive ? slate(0.9) : isRinging ? warning(0.8) : slate(0.3),
          border: `1.5px solid ${slate(0.1)}` }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.65rem', color: slate(0.9), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {call.name || formatPhone(call.phone)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: '0.48rem', color: isLive ? slate(0.5) : isRinging ? warning(0.6) : slate(0.3), letterSpacing: '0.1em' }}>
            {isLive ? 'LIVE' : isRinging ? 'RING' : call.status.toUpperCase().slice(0, 6)}
          </span>
          {isLive && <ElapsedCompact seconds={call.elapsed} boomer={boomer} />}
          <SignalMeter level={sig} max={5} color={isLive ? slate : isRinging ? warning : undefined} />
          {call.muted && <span style={{ fontSize: '0.42rem', color: warning(0.7) }}>MUTED</span>}
          {call.onHold && <span style={{ fontSize: '0.42rem', color: warning(0.7) }}>HOLD</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onMute}
          title={call.muted ? 'Unmute' : 'Mute'}
          style={{ ...btnBase, borderColor: call.muted ? warning(0.4) : slate(0.12), color: call.muted ? warning(0.8) : slate(0.5) }}
        >
          {call.muted ? <MicOff size={12} /> : <Mic size={12} />}
        </button>
        <button
          onClick={onHold}
          title={call.onHold ? 'Resume' : 'Hold'}
          style={{ ...btnBase, borderColor: call.onHold ? warning(0.4) : slate(0.12), color: call.onHold ? warning(0.8) : slate(0.5) }}
        >
          {call.onHold ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
        </button>
        <button
          onClick={onTransfer}
          title="Transfer"
          style={{ ...btnBase, borderColor: primary(0.25), color: primary(0.7) }}
        >
          <ArrowRightLeft size={12} />
        </button>
        <button
          onClick={onHangup}
          title="Hang Up"
          style={{ ...btnBase, borderColor: destructive(0.4), color: destructive(0.85), background: destructive(0.05) }}
        >
          <PhoneOff size={12} />
        </button>
      </div>
    </div>
  );
}

export function ActiveCallBar() {
  const isMobile = useIsMobile();

  const { activeCalls, toggleMute, toggleHold, transferCall, hangupOne } = useActiveCallContext();
  const [boomerMode] = useBoomerMode();
  const boomer = boomerMode;
  const [expanded, setExpanded] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);

  const liveCalls = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status));

  if (liveCalls.length === 0) return null;

  const primary = liveCalls[0];
  const hasMultiple = liveCalls.length > 1;

  return (
    <div
      style={{
        width: '100%',
        background: slate(0.02),
        borderBottom: `1px solid ${slate(0.15)}`,
        overflow: 'hidden',
        fontFamily: boomer ? undefined : FONT }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderBottom: expanded || hasMultiple ? `1px solid ${slate(0.08)}` : 'none',
          cursor: hasMultiple ? 'pointer' : 'default',
          background: slate(0.02) }}
        onClick={() => hasMultiple && setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: destructive(0.9),
            animation: 'pulse 1s infinite',
            flexShrink: 0 }} />
          <span style={{ fontSize: '0.52rem', color: slate(0.5), letterSpacing: '0.15em' }}>
            {liveCalls.length === 1 ? 'ACTIVE CALL' : `${liveCalls.length} ACTIVE CALLS`}
          </span>
          {!expanded && !hasMultiple && (
            <>
              <span style={{ fontSize: '0.52rem', color: slate(0.55) }}>·</span>
              <span style={{ fontSize: '0.6rem', color: slate(0.8), maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {primary.name || formatPhone(primary.phone)}
              </span>
              {primary.status === 'in-progress' && (
                <>
                  <span style={{ fontSize: '0.52rem', color: slate(0.55) }}>·</span>
                  <ElapsedCompact seconds={primary.elapsed} boomer={boomer} />
                </>
              )}
            </>
          )}
        </div>
        {hasMultiple && (
          <div style={{ color: slate(0.55), display: 'flex', alignItems: 'center' }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        )}
      </div>

      {(!hasMultiple || expanded) ? (
        liveCalls.map(call => (
          <div key={call.callSid}>
            <CallRow
              call={call}
              onMute={() => toggleMute(call.callSid, !!call.muted)}
              onHold={() => toggleHold(call.callSid, !!call.onHold)}
              onTransfer={() => setTransferTarget(t => t === call.callSid ? null : call.callSid)}
              onHangup={() => hangupOne(call.callSid)}
              boomer={boomer}
            />
            {transferTarget === call.callSid && (
              <TransferInput
                onConfirm={(num) => { transferCall(call.callSid, num); setTransferTarget(null); }}
                onCancel={() => setTransferTarget(null)}
                boomer={boomer}
              />
            )}
          </div>
        ))
      ) : (
        <>
          <CallRow
            call={primary}
            onMute={() => toggleMute(primary.callSid, !!primary.muted)}
            onHold={() => toggleHold(primary.callSid, !!primary.onHold)}
            onTransfer={() => setTransferTarget(t => t === primary.callSid ? null : primary.callSid)}
            onHangup={() => hangupOne(primary.callSid)}
            boomer={boomer}
          />
          {transferTarget === primary.callSid && (
            <TransferInput
              onConfirm={(num) => { transferCall(primary.callSid, num); setTransferTarget(null); }}
              onCancel={() => setTransferTarget(null)}
              boomer={boomer}
            />
          )}
        </>
      )}
    </div>
  );
}
