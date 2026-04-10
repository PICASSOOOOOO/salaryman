import { lazy, Suspense } from 'react';

const VideoTemplate = lazy(() => import('./VideoTemplate'));

export default function TrailerPlayer({ className }: { className?: string }) {
  return (
    <div className={className} style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.15)' }}>
      <Suspense fallback={
        <div style={{ width: '100%', height: '100%', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.8rem', letterSpacing: '0.15em' }}>
          LOADING TRAILER...
        </div>
      }>
        <div style={{ position: 'absolute', inset: 0 }}>
          <VideoTemplate />
        </div>
      </Suspense>
    </div>
  );
}
